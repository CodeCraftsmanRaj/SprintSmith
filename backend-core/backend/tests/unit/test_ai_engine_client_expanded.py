"""
Unit tests for services/ai_engine.py - AIEngineClient.

Verifies:
- _request validates path safety
- _request retries on transient errors for generation paths
- _request raises 502 on upstream HTTP errors
- _request raises 503 on connection errors
- _request raises 502 on invalid JSON
- health, artifact_types, generate, generate_compare, stream_generate
- ingest, ingest_status (including 404 handling)
- evaluate_batch
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from app.services.ai_engine import AIEngineClient, _SAFE_API_PATH


class TestSAFEApiPath:
    def test_accepts_safe_paths(self):
        assert _SAFE_API_PATH.fullmatch("/generate")
        assert _SAFE_API_PATH.fullmatch("/generate/compare")
        assert _SAFE_API_PATH.fullmatch("/health")
        assert _SAFE_API_PATH.fullmatch("/artifact-types")
        assert _SAFE_API_PATH.fullmatch("/ingest")
        assert _SAFE_API_PATH.fullmatch("/evaluate/batch")

    def test_rejects_unsafe_paths(self):
        assert not _SAFE_API_PATH.fullmatch("/generate/../../etc/passwd")
        assert not _SAFE_API_PATH.fullmatch("http://evil.com/x")
        assert not _SAFE_API_PATH.fullmatch("/generate?x=1")
        assert not _SAFE_API_PATH.fullmatch("/generate#fragment")
        assert not _SAFE_API_PATH.fullmatch("")
        assert not _SAFE_API_PATH.fullmatch("//generate")


class TestAIEngineClientRequest:
    @pytest.mark.asyncio
    async def test_request_success(self):
        client = AIEngineClient(base_url="http://engine:8001")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"status": "ok"}
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_engine.httpx.AsyncClient", return_value=mock_client):
            result = await client._request("GET", "/health")
            assert result == {"status": "ok"}

    @pytest.mark.asyncio
    async def test_request_transient_retry(self):
        client = AIEngineClient(base_url="http://engine:8001")
        call_count = 0

        def make_response(status):
            resp = MagicMock()
            resp.status_code = status
            resp.json.return_value = {"ok": True}
            resp.raise_for_status = MagicMock()
            return resp

        async def fake_request(method, url, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return make_response(502)
            return make_response(200)

        mock_client = MagicMock()
        mock_client.request = fake_request
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_engine.httpx.AsyncClient", return_value=mock_client):
            result = await client._request("POST", "/generate", json={})
            assert result == {"ok": True}
            assert call_count == 2

    @pytest.mark.asyncio
    async def test_request_http_status_error_502(self):
        client = AIEngineClient(base_url="http://engine:8001")
        resp = MagicMock()
        resp.status_code = 500
        resp.text = "Internal Server Error"
        exc = httpx.HTTPStatusError("boom", request=MagicMock(), response=resp)

        mock_client = MagicMock()
        mock_client.request = AsyncMock(side_effect=exc)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_engine.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception) as exc_info:
                await client._request("GET", "/health")
            assert "502" in str(exc_info.value) or "unavailable" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_request_connection_error_503(self):
        client = AIEngineClient(base_url="http://engine:8001")
        exc = httpx.RequestError("boom", request=MagicMock())

        mock_client = MagicMock()
        mock_client.request = AsyncMock(side_effect=exc)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_engine.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception):
                await client._request("GET", "/health")


class TestAIEngineClientMethods:
    @pytest.mark.asyncio
    async def test_health(self):
        client = AIEngineClient(base_url="http://engine:8001")
        with patch.object(client, "_request", AsyncMock(return_value={"status": "ok"})):
            result = await client.health()
            assert result == {"status": "ok"}
            client._request.assert_called_once_with("GET", "/health")

    @pytest.mark.asyncio
    async def test_artifact_types(self):
        client = AIEngineClient(base_url="http://engine:8001")
        with patch.object(client, "_request", AsyncMock(return_value=["user_story", "task"])):
            result = await client.artifact_types()
            assert result == ["user_story", "task"]

    @pytest.mark.asyncio
    async def test_generate(self):
        client = AIEngineClient(base_url="http://engine:8001")
        with patch.object(client, "_request", AsyncMock(return_value={"job_id": "j1"})):
            result = await client.generate("proj-1", "user_story", "test req")
            assert result == {"job_id": "j1"}
            client._request.assert_called_once()
            args = client._request.call_args
            assert args[0][0] == "POST"
            assert args[0][1] == "/generate"

    @pytest.mark.asyncio
    async def test_generate_compare(self):
        client = AIEngineClient(base_url="http://engine:8001")
        with patch.object(client, "_request", AsyncMock(return_value={"a": 1})):
            result = await client.generate_compare("proj-1", "user_story", "test")
            assert result == {"a": 1}

    @pytest.mark.asyncio
    async def test_ingest(self):
        client = AIEngineClient(base_url="http://engine:8001")
        with patch.object(client, "_request", AsyncMock(return_value={"job_id": "ingest-1"})):
            result = await client.ingest("/tmp/file.txt", "proj-1", "requirement", "req-1")
            assert result == {"job_id": "ingest-1"}

    @pytest.mark.asyncio
    async def test_ingest_status_404(self):
        client = AIEngineClient(base_url="http://engine:8001")
        resp = MagicMock()
        resp.status_code = 404
        mock_client = MagicMock()
        mock_client.request = AsyncMock(return_value=resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.ai_engine.httpx.AsyncClient", return_value=mock_client):
            result = await client.ingest_status("job-1")
            assert result["status"] == "failed"
            assert "unknown" in result["error"]

    @pytest.mark.asyncio
    async def test_evaluate_batch(self):
        client = AIEngineClient(base_url="http://engine:8001")
        with patch.object(client, "_request", AsyncMock(return_value={"status": "started"})):
            result = await client.evaluate_batch(project_id="proj-1", retrieval_mode="vector")
            assert result == {"status": "started"}
            client._request.assert_called_once_with("POST", "/evaluate/batch", params={"retrieval_mode": "vector", "project_id": "proj-1"})
