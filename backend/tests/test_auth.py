from typing import Any, Iterable, Tuple

from werkzeug.security import generate_password_hash

from backend.app import create_app
from backend import auth as auth_module


class FakeCursor:
    def __init__(self, row: Tuple[Any, ...] | None):
        self._row = row

    def execute(self, query: str, params: Iterable[Any] | None = None):
        return None

    def fetchone(self):
        return self._row


class FakeConnection:
    def __init__(self, row: Tuple[Any, ...] | None):
        self._cursor = FakeCursor(row)

    def cursor(self):
        return self._cursor


def test_login_invalid_credentials(monkeypatch):
    def fake_get_connection():
        return FakeConnection(None)

    monkeypatch.setattr(auth_module, "get_connection", fake_get_connection)
    monkeypatch.setattr(auth_module, "release_connection", lambda conn: None)

    app = create_app(testing=True)
    client = app.test_client()

    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "secret"},
    )

    assert response.status_code == 401
    body = response.get_json()
    assert body["error"] == "invalid_credentials"


def test_login_success(monkeypatch):
    password_hash = generate_password_hash("secret")
    row = (1, "Admin", "User", "admin@example.com", "administrator", password_hash)

    def fake_get_connection():
        return FakeConnection(row)

    monkeypatch.setattr(auth_module, "get_connection", fake_get_connection)
    monkeypatch.setattr(auth_module, "release_connection", lambda conn: None)

    app = create_app(testing=True)
    client = app.test_client()

    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "secret"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert "access_token" in body
    assert body["user"]["email"] == "admin@example.com"
    assert body["user"]["role"] == "administrator"

