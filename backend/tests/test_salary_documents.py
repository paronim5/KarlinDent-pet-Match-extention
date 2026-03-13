import pytest
import os
from datetime import date
from backend.app import create_app
from backend import staff as staff_module
from backend.db import get_connection, release_connection


SIGNATURE_DATA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABAABJzQnCgAAAABJRU5ErkJggg=="


@pytest.fixture
def client():
    app = create_app(testing=True)
    with app.test_client() as client:
        with app.app_context():
            try:
                conn = get_connection()
            except Exception:
                pytest.skip("Database not available for salary document tests")
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS staff_documents (
                    id              SERIAL PRIMARY KEY,
                    staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
                    document_type   VARCHAR(60) NOT NULL,
                    period_from     DATE,
                    period_to       DATE,
                    signed_at       TIMESTAMPTZ,
                    signer_name     VARCHAR(150) NOT NULL,
                    signature_hash  VARCHAR(64) NOT NULL,
                    signature_token VARCHAR(64),
                    file_path       TEXT NOT NULL,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute("DELETE FROM staff_documents")
            try:
                cur.execute("DELETE FROM staff_timesheets")
            except Exception:
                conn.rollback()
            cur.execute("DELETE FROM salary_payments")
            cur.execute("DELETE FROM staff")
            cur.execute("DELETE FROM staff_roles")
            cur.execute("INSERT INTO staff_roles (id, name) VALUES (1, 'doctor') ON CONFLICT (id) DO NOTHING")
            cur.execute("INSERT INTO staff_roles (id, name) VALUES (2, 'assistant') ON CONFLICT (id) DO NOTHING")
            cur.execute(
                """
                INSERT INTO staff (id, role_id, first_name, last_name, email, base_salary, commission_rate, total_revenue, is_active)
                VALUES (2, 2, 'Test', 'Assistant', 'assistant@test.com', 200.00, 0.0, 0.00, TRUE)
                """
            )
            cur.execute(
                """
                INSERT INTO staff (id, role_id, first_name, last_name, email, base_salary, commission_rate, total_revenue, is_active)
                VALUES (3, 2, 'Other', 'User', 'other@test.com', 200.00, 0.0, 0.00, TRUE)
                """
            )
            conn.commit()
            release_connection(conn)
        yield client


def test_salary_report_requires_auth(client):
    payload = {
        "from": date.today().isoformat(),
        "to": date.today().isoformat(),
        "signature": {
            "signer_name": "Test Assistant",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    resp = client.post("/api/staff/2/salary-report/pdf", json=payload)
    assert resp.status_code == 401


def test_salary_report_rejects_signer_mismatch(client):
    payload = {
        "from": date.today().isoformat(),
        "to": date.today().isoformat(),
        "signature": {
            "signer_name": "Mismatch Name",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    resp = client.post(
        "/api/staff/2/salary-report/pdf",
        json=payload,
        headers={"X-Staff-Id": "2", "X-Staff-Role": "assistant"}
    )
    assert resp.status_code == 403
    assert resp.json["error"] == "signer_name_mismatch"


def test_salary_report_stores_document(client):
    payload = {
        "from": date.today().isoformat(),
        "to": date.today().isoformat(),
        "signature": {
            "signer_name": "Test Assistant",
            "signature_data": SIGNATURE_DATA,
            "signed_at": date.today().isoformat()
        }
    }
    resp = client.post(
        "/api/staff/2/salary-report/pdf",
        json=payload,
        headers={"X-Staff-Id": "2", "X-Staff-Role": "assistant"}
    )
    assert resp.status_code == 200
    list_resp = client.get(
        "/api/staff/2/documents?type=salary_report",
        headers={"X-Staff-Id": "2", "X-Staff-Role": "assistant"}
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json) >= 1


def test_salary_document_access_forbidden(client):
    list_resp = client.get(
        "/api/staff/2/documents?type=salary_report",
        headers={"X-Staff-Id": "3", "X-Staff-Role": "assistant"}
    )
    assert list_resp.status_code == 403


def test_salary_documents_filter_overlapping_periods(client):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO staff_documents
                (staff_id, document_type, period_from, period_to, signed_at, signer_name, signature_hash, signature_token, file_path)
            VALUES
                (%s, %s, %s, %s, NOW(), %s, %s, %s, %s)
            """,
            (
                2,
                "salary_report",
                date(2026, 2, 28),
                date(2026, 3, 13),
                "Test Assistant",
                "a" * 64,
                "b" * 64,
                "/tmp/salary_report_overlap.pdf",
            ),
        )
        conn.commit()
    finally:
        release_connection(conn)

    resp = client.get(
        "/api/staff/2/documents?type=salary_report&from=2026-03-07&to=2026-03-13",
        headers={"X-Staff-Id": "2", "X-Staff-Role": "assistant"}
    )
    assert resp.status_code == 200
    assert len(resp.json) >= 1


def test_salary_document_view_returns_inline_pdf(client):
    base_dir = staff_module.get_documents_base_dir()
    staff_dir = os.path.join(base_dir, "staff_2")
    os.makedirs(staff_dir, exist_ok=True)
    file_path = os.path.join(staff_dir, "inline-view-test.pdf")
    with open(file_path, "wb") as handle:
        handle.write(b"%PDF-1.4\n%%EOF")

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO staff_documents
                (staff_id, document_type, period_from, period_to, signed_at, signer_name, signature_hash, signature_token, file_path)
            VALUES
                (%s, %s, %s, %s, NOW(), %s, %s, %s, %s)
            RETURNING id
            """,
            (
                2,
                "salary_report",
                date(2026, 3, 1),
                date(2026, 3, 13),
                "Test Assistant",
                "c" * 64,
                "d" * 64,
                file_path,
            ),
        )
        document_id = int(cur.fetchone()[0])
        conn.commit()
    finally:
        release_connection(conn)

    resp = client.get(
        f"/api/staff/2/documents/{document_id}/view",
        headers={"X-Staff-Id": "2", "X-Staff-Role": "assistant"}
    )
    assert resp.status_code == 200
    assert resp.mimetype == "application/pdf"
