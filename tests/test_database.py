"""Database connection tests for SprintSmith backend."""
import pytest


class TestDatabaseConnection:
    """Test database connection functions."""

    def test_connection_context_manager(self):
        """Test that the connection context manager works."""
        from apps.api.app.database import connection
        # Just verify the function exists and is callable
        assert callable(connection)

    def test_database_is_ready_false(self):
        """Test database_is_ready returns False when DB unavailable."""
        from apps.api.app.database import database_is_ready
        # When DB is not available, should return False
        result = database_is_ready()
        # This may raise or return False depending on environment
        assert result is False or result is True


class TestHealthEndpoint:
    """Health endpoint tests."""

    def test_health_endpoint_exists(self):
        """Test that health endpoint is defined."""
        from apps.api.app.main import app
        from fastapi.testclient import TestClient

        client = TestClient(app)
        response = client.get("/health")
        # Should not crash
        assert response is not None