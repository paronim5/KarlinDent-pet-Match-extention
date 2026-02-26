import csv
from datetime import date, datetime
from io import BytesIO, StringIO
from typing import Any, Dict, List

from flask import Blueprint, Response, jsonify, request
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from .db import get_connection, release_connection


clinic_bp = Blueprint("clinic", __name__)


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def fetch_daily_pnl(start: date, end: date) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT day, total_income, total_outcome, pnl
            FROM daily_pnl
            WHERE day BETWEEN %s AND %s
            ORDER BY day
            """,
            (start, end),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    return [
        {
            "day": row[0].isoformat(),
            "total_income": float(row[1]),
            "total_outcome": float(row[2]),
            "pnl": float(row[3]),
        }
        for row in rows
    ]

def compute_doctor_avg_salary(start: date, end: date) -> float:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id,
                   COALESCE(SUM(ir.amount * s.commission_rate), 0) AS earnings
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            LEFT JOIN income_records ir
              ON ir.doctor_id = s.id
             AND ir.service_date BETWEEN %s AND %s
            WHERE r.name = 'doctor' AND s.is_active = TRUE
            GROUP BY s.id
            """,
            (start, end),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)
    if not rows:
        return 0.0
    avg = sum(float(row[1] or 0) for row in rows) / len(rows)
    return round(avg, 2)


@clinic_bp.route("/dashboard", methods=["GET"])
def dashboard():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT setting_value FROM clinic_settings WHERE setting_key = 'monthly_lease_cost'"
        )
        lease_row = cur.fetchone()
        lease_cost = float(lease_row[0]) if lease_row and lease_row[0] is not None else 0.0

        cur.execute("SELECT avg_payment FROM avg_patient_payment")
        avg_payment_row = cur.fetchone()
        avg_payment = (
            float(avg_payment_row[0]) if avg_payment_row and avg_payment_row[0] is not None else 0.0
        )

        cur.execute("SELECT role, avg_salary FROM avg_salary_by_role")
        avg_salary_rows = cur.fetchall()
    finally:
        release_connection(conn)

    avg_salary_by_role = {row[0]: float(row[1]) for row in avg_salary_rows}
    if "doctor" not in avg_salary_by_role or avg_salary_by_role["doctor"] == 0.0:
        avg_salary_by_role["doctor"] = compute_doctor_avg_salary(start, end)

    pnl_series = fetch_daily_pnl(start, end)

    return jsonify(
        {
            "lease_cost": lease_cost,
            "avg_payment_per_patient": avg_payment,
            "avg_salary_by_role": avg_salary_by_role,
            "daily_pnl": pnl_series,
        }
    )


@clinic_bp.route("/daily-pnl/export/csv", methods=["GET"])
def export_daily_pnl_csv():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    pnl_series = fetch_daily_pnl(start, end)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["day", "total_income", "total_outcome", "pnl"])
    for item in pnl_series:
        writer.writerow(
            [
                item["day"],
                item["total_income"],
                item["total_outcome"],
                item["pnl"],
            ]
        )

    csv_data = output.getvalue()

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=daily_pnl.csv",
        },
    )


@clinic_bp.route("/daily-pnl/export/pdf", methods=["GET"])
def export_daily_pnl_pdf():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    pnl_series = fetch_daily_pnl(start, end)

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(20 * mm, height - 20 * mm, "Daily P&L")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(20 * mm, height - 26 * mm, f"From {start.isoformat()} to {end.isoformat()}")

    y = height - 40 * mm
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(20 * mm, y, "Day")
    pdf.drawString(55 * mm, y, "Income")
    pdf.drawString(95 * mm, y, "Outcome")
    pdf.drawString(135 * mm, y, "P&L")

    pdf.setFont("Helvetica", 9)
    y -= 6 * mm
    for item in pnl_series:
        if y < 20 * mm:
            pdf.showPage()
            y = height - 20 * mm
            pdf.setFont("Helvetica-Bold", 9)
            pdf.drawString(20 * mm, y, "Day")
            pdf.drawString(55 * mm, y, "Income")
            pdf.drawString(95 * mm, y, "Outcome")
            pdf.drawString(135 * mm, y, "P&L")
            pdf.setFont("Helvetica", 9)
            y -= 6 * mm

        pdf.drawString(20 * mm, y, item["day"])
        pdf.drawRightString(80 * mm, y, f"{item['total_income']:.2f}")
        pdf.drawRightString(120 * mm, y, f"{item['total_outcome']:.2f}")
        pdf.drawRightString(160 * mm, y, f"{item['pnl']:.2f}")
        y -= 6 * mm

    pdf.showPage()
    pdf.save()
    pdf_data = buffer.getvalue()
    buffer.close()

    return Response(
        pdf_data,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=daily_pnl.pdf",
        },
    )
