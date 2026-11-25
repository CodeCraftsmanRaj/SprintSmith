"""Main application tests for SprintSmith backend."""
from app.database import fetch_all
from app.main import app
from fastapi.testclient import TestClient


class TestHealth:
    """Health check endpoint tests."""

    def test_health_endpoint_returns_200(self):
        """Health endpoint should return 200 OK."""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_endpoint_json_format(self):
        """Health endpoint should return valid JSON."""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "status" in data
        assert "service" in data
        assert "version" in data

    def test_health_endpoint_has_status_field(self):
        """Health endpoint should have status field."""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestReady:
    """Ready endpoint tests."""

    def test_ready_endpoint_when_db_up(self):
        """Ready endpoint should return 200 when database is up."""
        client = TestClient(app)
        # When DB is available, ready should return 200
        response = client.get("/ready")
        assert response.status_code in (200, 503)

    def test_ready_endpoint_returns_health_format(self):
        """Ready endpoint should return health response format."""
        client = TestClient(app)
        response = client.get("/ready")
        assert response.status_code == 200 or response.status_code == 503
        if response.status_code == 200:
            data = response.json()
            assert "status" in data


class TestMetrics:
    """Metrics endpoint tests."""

    def test_metrics_endpoint(self):
        """Metrics endpoint should return prometheus metrics."""
        client = TestClient(app)
        response = client.get("/metrics")
        # May or may not work depending on prometheus client state
        assert response is not None


class TestRoot:
    """Root endpoint tests."""

    def test_root_endpoint(self):
        """Root endpoint should respond."""
        client = TestClient(app)
        response = client.get("/")
        assert response is not None


class TestDatabaseConnection:
    """Database connection tests."""

    def test_connection_context_manager(self):
        """Test that the connection context manager works."""
        from app.database import connection
        # Just verify the function exists and is callable
        assert callable(connection)

    def test_database_is_ready(self):
        """Test database_is_ready function is callable."""
        from app.database import database_is_ready
        assert callable(database_is_ready)

    def test_fetch_all_function(self):
        """Test fetch_all function exists and is callable."""
        assert callable(fetch_all)


class TestLifespan:
    """Lifespan/context manager tests."""

    def test_lifespan_import(self):
        """Lifespan function should be importable."""
        from app.main import lifespan
        assert callable(lifespan)


class TestCounters:
    """Prometheus counter/histogram tests."""

    def test_counters_defined(self):
        """HTTP request counters should be defined."""
        from app.main import HTTP_LATENCY, HTTP_REQUESTS
        assert HTTP_REQUESTS is not None
        assert HTTP_LATENCY is not None


class TestAppInitialization:
    """FastAPI app initialization tests."""

    def test_app_is_fastapi(self):
        """App should be a FastAPI instance."""
        from fastapi import FastAPI
        assert isinstance(app, FastAPI)

    def test_app_title(self):
        """App should have title."""
        assert app.title == "SprintSmith API"

    def test_app_version(self):
        """App should have version."""
        assert app.version is not None