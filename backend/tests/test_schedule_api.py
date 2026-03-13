
import pytest
from datetime import date
from backend.app import create_app
from backend import schedule

@pytest.fixture
def client():
    app = create_app(testing=True)
    with app.test_client() as client:
        yield client

def test_list_shifts_missing_params(client):
    response = client.get("/api/schedule")
    assert response.status_code == 400
    assert "start and end dates are required" in response.json["error"]

def test_list_shifts_invalid_date(client):
    response = client.get("/api/schedule?start=invalid&end=2024-01-01")
    assert response.status_code == 400
    assert "invalid_date_format" in response.json["error"]

def test_list_shifts_query_error(monkeypatch, client):
    # Mock DB connection and cursor to simulate a query error
    class MockCursor:
        def execute(self, query, params):
            raise Exception("Simulated DB Error")
        def fetchall(self):
            return []

    class MockConn:
        def cursor(self):
            return MockCursor()
        def close(self):
            pass

    def mock_get_connection():
        return MockConn()

    def mock_release_connection(conn):
        pass

    monkeypatch.setattr(schedule, "get_connection", mock_get_connection)
    monkeypatch.setattr(schedule, "release_connection", mock_release_connection)

    response = client.get("/api/schedule?start=2024-01-01&end=2024-01-02")
    assert response.status_code == 500
    assert response.json["error"] == "internal_server_error"
    assert response.json["message"] == "An unexpected error occurred"

def test_create_shift_missing_data(client):
    response = client.post("/api/schedule", json={})
    assert response.status_code == 400
    assert response.json["error"] == "no_data"

def test_create_shift_missing_field(client):
    response = client.post("/api/schedule", json={"start_time": "2024-01-01", "end_time": "2024-01-01"})
    assert response.status_code == 400
    assert "missing_field" in response.json["error"]
