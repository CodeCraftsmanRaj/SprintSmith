"""Configuration tests for SprintSmith backend."""
from app.main import app
from fastapi.testclient import TestClient


class TestConfig:
    """Configuration and settings tests."""

    def test_app_configuration(self):
        """Test app is properly configured."""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200

    def test_version_attribute(self):
        """Test app has version attribute."""
        from app.main import app
        assert hasattr(app, 'version')
        assert app.version is not None


class TestAppHealth:
    """Health-related configuration tests."""

    def test_health_endpoint_with_query(self):
        """Health endpoint with various queries."""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200


class TestAppImports:
    """Test main module imports work correctly."""

    def test_main_imports(self):
        """Test main module can be imported."""
        from app.main import HTTP_LATENCY, HTTP_REQUESTS, app
        assert app is not None
        assert HTTP_REQUESTS is not None
        assert HTTP_LATENCY is not None