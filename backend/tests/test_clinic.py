from datetime import date

from backend.app import create_app
from backend import clinic as clinic_module


def _authorized_headers():
    return {}


def test_export_daily_pnl_csv(monkeypatch):
    def fake_fetch_daily_pnl(start: date, end: date):
        return [
            {
                "day": "2024-01-01",
                "total_income": 100.0,
                "total_outcome": 40.0,
                "pnl": 60.0,
            }
        ]

    monkeypatch.setattr(clinic_module, "fetch_daily_pnl", fake_fetch_daily_pnl)

    app = create_app(testing=True)
    client = app.test_client()

    response = client.get(
        "/api/clinic/daily-pnl/export/csv",
        headers=_authorized_headers(),
    )

    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    content = response.get_data(as_text=True)
    assert "2024-01-01" in content
    assert "100.0" in content


def test_export_daily_pnl_pdf(monkeypatch):
    def fake_fetch_daily_pnl(start: date, end: date):
        return [
            {
                "day": "2024-01-01",
                "total_income": 100.0,
                "total_outcome": 40.0,
                "pnl": 60.0,
            }
        ]

    monkeypatch.setattr(clinic_module, "fetch_daily_pnl", fake_fetch_daily_pnl)

    app = create_app(testing=True)
    client = app.test_client()

    response = client.get(
        "/api/clinic/daily-pnl/export/pdf",
        headers=_authorized_headers(),
    )

    assert response.status_code == 200
    assert response.mimetype == "application/pdf"
    assert len(response.data) > 0

