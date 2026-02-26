import csv
from datetime import date, datetime
from io import StringIO
from typing import Any, Dict, List

from flask import Blueprint, Response, jsonify, request
import psycopg2

from .auth import admin_required, get_current_user
from .db import get_connection, release_connection


outcome_bp = Blueprint("outcome", __name__)


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def validate_amount(value: Any) -> float:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_amount")
    if amount <= 0:
        raise ValueError("invalid_amount")
    return amount


def _ensure_timesheets_table(conn) -> None:
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM staff_timesheets LIMIT 1")
    except Exception:
        conn.rollback()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS staff_timesheets (
                id SERIAL PRIMARY KEY,
                staff_id INTEGER NOT NULL REFERENCES staff(id),
                work_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                hours NUMERIC(6,2) NOT NULL DEFAULT 0,
                note TEXT
            )
            """
        )
        conn.commit()


def _ensure_timesheets_audit_table(conn) -> None:
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM timesheets_audit LIMIT 1")
    except Exception:
        conn.rollback()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS timesheets_audit (
                id SERIAL PRIMARY KEY,
                timesheet_id INTEGER,
                staff_id INTEGER NOT NULL REFERENCES staff(id),
                action VARCHAR(20) NOT NULL,
                old_data JSONB,
                new_data JSONB,
                changed_by_id INTEGER NOT NULL REFERENCES staff(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.commit()


def _log_timesheet_change(conn, timesheet_id, staff_id, action, old_data, new_data, changed_by_id):
    _ensure_timesheets_audit_table(conn)
    cur = conn.cursor()
    import json
    cur.execute(
        """
        INSERT INTO timesheets_audit (timesheet_id, staff_id, action, old_data, new_data, changed_by_id)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            timesheet_id,
            staff_id,
            action,
            json.dumps(old_data) if old_data else None,
            json.dumps(new_data) if new_data else None,
            changed_by_id
        )
    )


def _ensure_salary_audit_table(conn) -> None:
    cur = conn.cursor()
    try:
        cur.execute("SELECT 1 FROM salary_withdrawal_audit LIMIT 1")
    except Exception:
        conn.rollback()
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS salary_withdrawal_audit (
                id SERIAL PRIMARY KEY,
                staff_id INTEGER NOT NULL REFERENCES staff(id),
                salary_payment_id INTEGER REFERENCES salary_payments(id),
                payment_date DATE NOT NULL,
                requested_amount NUMERIC(10,2) NOT NULL,
                processed_amount NUMERIC(10,2) NOT NULL,
                status VARCHAR(20) NOT NULL,
                error_code VARCHAR(50),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        conn.commit()


def _evaluate_salary_withdrawal(total_earnings: float, already_paid: float, requested_amount: float) -> Dict[str, Any]:
    available_before = max(total_earnings - already_paid, 0.0)
    if total_earnings <= 0:
        return {
            "allowed": False,
            "status": "no_earnings",
            "error_code": "no_earnings",
            "available_before": available_before,
            "processed_amount": 0.0,
        }
    if available_before <= 0:
        return {
            "allowed": False,
            "status": "salary_already_withdrawn",
            "error_code": "salary_already_withdrawn",
            "available_before": available_before,
            "processed_amount": 0.0,
        }
    if requested_amount > available_before:
        return {
            "allowed": False,
            "status": "insufficient_balance",
            "error_code": "insufficient_balance",
            "available_before": available_before,
            "processed_amount": 0.0,
        }
    processed_amount = requested_amount
    return {
        "allowed": True,
        "status": "ok",
        "error_code": None,
        "available_before": available_before,
        "processed_amount": processed_amount,
        "available_after": max(available_before - processed_amount, 0.0),
    }


@outcome_bp.route("/categories", methods=["GET"])
@admin_required
def list_categories():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, name
            FROM outcome_categories
            ORDER BY name
            """
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [{"id": row[0], "name": row[1]} for row in rows]
    return jsonify(items)


@outcome_bp.route("/records", methods=["GET"])
@admin_required
def list_outcome_records():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                """
                SELECT o.id,
                       o.expense_date,
                       o.amount,
                       o.description,
                       o.vendor,
                       c.name
                FROM outcome_records o
                JOIN outcome_categories c ON c.id = o.category_id
                WHERE o.expense_date BETWEEN %s AND %s
                ORDER BY o.expense_date DESC, o.id DESC
                """,
                (start, end),
            )
            rows = cur.fetchall()
            with_vendor = True
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                SELECT o.id,
                       o.expense_date,
                       o.amount,
                       o.description,
                       c.name
                FROM outcome_records o
                JOIN outcome_categories c ON c.id = o.category_id
                WHERE o.expense_date BETWEEN %s AND %s
                ORDER BY o.expense_date DESC, o.id DESC
                """,
                (start, end),
            )
            rows = cur.fetchall()
            with_vendor = False
    finally:
        release_connection(conn)

    items = []
    for row in rows:
        if with_vendor:
            items.append(
                {
                    "id": row[0],
                    "expense_date": row[1].isoformat(),
                    "amount": float(row[2]),
                    "description": row[3],
                    "vendor": row[4],
                    "category": row[5],
                }
            )
        else:
            items.append(
                {
                    "id": row[0],
                    "expense_date": row[1].isoformat(),
                    "amount": float(row[2]),
                    "description": row[3],
                    "vendor": "",
                    "category": row[4],
                }
            )

    return jsonify(items)


@outcome_bp.route("/records", methods=["POST"])
@admin_required
def create_outcome_record():
    data = request.get_json(silent=True) or {}

    category_id = data.get("category_id")
    description = data.get("description")
    vendor = data.get("vendor")

    if not category_id:
        return jsonify({"error": "invalid_category"}), 400

    try:
        amount = validate_amount(data.get("amount"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    expense_date_param = data.get("expense_date")
    expense_date = (
        parse_date(expense_date_param) if expense_date_param else date.today()
    )

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM outcome_categories WHERE id = %s",
            (category_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid_category"}), 400

        try:
            cur.execute(
                """
                INSERT INTO outcome_records
                    (category_id, amount, expense_date, description, vendor)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (category_id, amount, expense_date, description, vendor),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO outcome_records
                    (category_id, amount, expense_date, description)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (category_id, amount, expense_date, description),
            )
        new_row = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(new_row[0])}), 201


@outcome_bp.route("/records/<int:record_id>", methods=["DELETE"])
@admin_required
def delete_outcome_record(record_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM outcome_records WHERE id = %s", (record_id,))
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({"error": "not_found"}), 404
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"}), 200


@outcome_bp.route("/timesheets", methods=["GET"])
def list_timesheets():
    user = get_current_user()
    if not user:
        return jsonify({"error": "unauthorized", "message": "Missing or invalid token"}), 401
    current_user_id, current_user_role = user

    staff_id_param = request.args.get("staff_id")
    if not staff_id_param:
        return jsonify([])
    staff_id = int(staff_id_param)

    # Permission check: Only admin or the staff member themselves can view their timesheets
    if current_user_role != "admin" and current_user_role != "administrator" and current_user_id != staff_id:
        return jsonify({"error": "forbidden", "message": "You do not have permission to view these timesheets"}), 403

    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")
    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, work_date, start_time, end_time, hours, note
            FROM staff_timesheets
            WHERE staff_id = %s AND work_date BETWEEN %s AND %s
            ORDER BY work_date DESC, id DESC
            """,
            (staff_id, start, end),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [
        {
            "id": r[0],
            "work_date": r[1].isoformat(),
            "start_time": r[2].isoformat(),
            "end_time": r[3].isoformat(),
            "hours": float(r[4]),
            "note": r[5],
        }
        for r in rows
    ]
    return jsonify(items)


@outcome_bp.route("/timesheets", methods=["POST"])
def create_timesheet():
    user = get_current_user()
    if not user:
        return jsonify({"error": "unauthorized", "message": "Missing or invalid token"}), 401
    current_user_id, current_user_role = user

    data = request.get_json(silent=True) or {}
    staff_id = data.get("staff_id")
    if not staff_id:
        return jsonify({"error": "invalid_staff"}), 400
    staff_id = int(staff_id)

    # Permission check: Only admin or the staff member themselves can add their timesheets
    if current_user_role != "admin" and current_user_role != "administrator" and current_user_id != staff_id:
        return jsonify({"error": "forbidden", "message": "You do not have permission to add these timesheets"}), 403

    work_date = parse_date(data.get("work_date")) if data.get("work_date") else date.today()
    start_raw = data.get("start_time")
    end_raw = data.get("end_time")
    note = data.get("note")
    if not start_raw or not end_raw:
        return jsonify({"error": "invalid_times"}), 400
    try:
        start_time = datetime.strptime(start_raw, "%H:%M").time()
        end_time = datetime.strptime(end_raw, "%H:%M").time()
    except ValueError:
        return jsonify({"error": "invalid_times"}), 400

    start_dt = datetime.combine(work_date, start_time)
    end_dt = datetime.combine(work_date, end_time)
    if end_dt <= start_dt:
        return jsonify({"error": "invalid_times"}), 400
    seconds = (end_dt - start_dt).seconds
    hours = round(seconds / 3600.0, 2)

    conn = get_connection()
    try:
        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM staff WHERE id = %s AND is_active = TRUE",
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid_staff"}), 400
        cur.execute(
            """
            INSERT INTO staff_timesheets
                (staff_id, work_date, start_time, end_time, hours, note)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (staff_id, work_date, start_time, end_time, hours, note),
        )
        new_row = cur.fetchone()
        timesheet_id = int(new_row[0])

        _log_timesheet_change(
            conn,
            timesheet_id,
            staff_id,
            "create",
            None,
            {
                "work_date": work_date.isoformat(),
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "hours": hours,
                "note": note,
            },
            current_user_id
        )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": timesheet_id, "hours": hours}), 201


@outcome_bp.route("/timesheets/<int:ts_id>", methods=["PUT"])
def update_timesheet(ts_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"error": "unauthorized", "message": "Missing or invalid token"}), 401
    current_user_id, current_user_role = user

    data = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT staff_id, work_date, start_time, end_time, hours, note FROM staff_timesheets WHERE id = %s",
            (ts_id,)
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not_found"}), 404

        staff_id = row[0]
        # Permission check: Only admin or the staff member themselves can update their timesheets
        if current_user_role != "admin" and current_user_role != "administrator" and current_user_id != staff_id:
            return jsonify({"error": "forbidden", "message": "You do not have permission to update this shift"}), 403

        old_data = {
            "work_date": row[1].isoformat(),
            "start_time": row[2].isoformat(),
            "end_time": row[3].isoformat(),
            "hours": float(row[4]),
            "note": row[5]
        }

        work_date = parse_date(data.get("work_date")) if data.get("work_date") else row[1]
        start_raw = data.get("start_time")
        end_raw = data.get("end_time")
        note = data.get("note") if "note" in data else row[5]

        if start_raw:
            start_time = datetime.strptime(start_raw, "%H:%M").time()
        else:
            start_time = row[2]

        if end_raw:
            end_time = datetime.strptime(end_raw, "%H:%M").time()
        else:
            end_time = row[3]

        start_dt = datetime.combine(work_date, start_time)
        end_dt = datetime.combine(work_date, end_time)
        if end_dt <= start_dt:
            return jsonify({"error": "invalid_times"}), 400
        seconds = (end_dt - start_dt).seconds
        hours = round(seconds / 3600.0, 2)

        cur.execute(
            """
            UPDATE staff_timesheets
            SET work_date = %s, start_time = %s, end_time = %s, hours = %s, note = %s
            WHERE id = %s
            """,
            (work_date, start_time, end_time, hours, note, ts_id)
        )

        _log_timesheet_change(
            conn,
            ts_id,
            staff_id,
            "update",
            old_data,
            {
                "work_date": work_date.isoformat() if hasattr(work_date, "isoformat") else work_date,
                "start_time": start_time.isoformat() if hasattr(start_time, "isoformat") else start_time,
                "end_time": end_time.isoformat() if hasattr(end_time, "isoformat") else end_time,
                "hours": hours,
                "note": note,
            },
            current_user_id
        )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok", "hours": hours}), 200


@outcome_bp.route("/timesheets/<int:ts_id>", methods=["DELETE"])
def delete_timesheet(ts_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"error": "unauthorized", "message": "Missing or invalid token"}), 401
    current_user_id, current_user_role = user

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT staff_id, work_date, start_time, end_time, hours, note FROM staff_timesheets WHERE id = %s",
            (ts_id,)
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "not_found"}), 404

        staff_id = row[0]
        # Permission check: Only admin or the staff member themselves can delete their timesheets
        if current_user_role != "admin" and current_user_role != "administrator" and current_user_id != staff_id:
            return jsonify({"error": "forbidden", "message": "You do not have permission to delete this shift"}), 403

        old_data = {
            "work_date": row[1].isoformat(),
            "start_time": row[2].isoformat(),
            "end_time": row[3].isoformat(),
            "hours": float(row[4]),
            "note": row[5]
        }

        cur.execute("DELETE FROM staff_timesheets WHERE id = %s", (ts_id,))

        _log_timesheet_change(
            conn,
            ts_id,
            staff_id,
            "delete",
            old_data,
            None,
            current_user_id
        )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"}), 200


@outcome_bp.route("/salary/suggested", methods=["GET"])
@admin_required
def suggested_salary():
    staff_id_param = request.args.get("staff_id")
    if not staff_id_param:
        return jsonify({"error": "invalid_staff"}), 400
    staff_id = int(staff_id_param)
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")
    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id, s.base_salary, r.name
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s AND s.is_active = TRUE
            """,
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid_staff"}), 400
        role_name = row[2]
        if role_name == "doctor":
            # ... existing doctor code ...
            try:
                cur.execute(
                    """
                    SELECT COALESCE(SUM(ir.amount * s.commission_rate), 0)
                    FROM income_records ir
                    JOIN staff s ON s.id = ir.doctor_id
                    WHERE ir.doctor_id = %s AND ir.service_date BETWEEN %s AND %s
                    """,
                    (staff_id, start, end),
                )
            except Exception:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT COALESCE(SUM(ir.amount) * 0.30, 0)
                    FROM income_records ir
                    WHERE ir.doctor_id = %s AND ir.service_date BETWEEN %s AND %s
                    """,
                    (staff_id, start, end),
                )
            total_earnings = float(cur.fetchone()[0] or 0)
        elif role_name == "administrator":
            base_salary = float(row[1] or 0)
            total_earnings = base_salary
        else:
            _ensure_timesheets_table(conn)
            cur = conn.cursor()
            cur.execute(
                """
                SELECT COALESCE(SUM(t.hours), 0) AS total_hours, s.base_salary
                FROM staff_timesheets t
                JOIN staff s ON s.id = t.staff_id
                WHERE t.staff_id = %s AND t.work_date BETWEEN %s AND %s
                GROUP BY s.base_salary
                """,
                (staff_id, start, end),
            )
            ts_row = cur.fetchone()
            if not ts_row:
                total_earnings = 0.0
            else:
                total_hours = float(ts_row[0] or 0)
                base_salary = float(ts_row[1] or 0)
                total_earnings = round(total_hours * base_salary, 2)

        cur = conn.cursor()
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_payments
            WHERE staff_id = %s
              AND payment_date BETWEEN %s AND %s
              AND (note IS NULL OR note NOT LIKE 'Commission from income #%%')
            """,
            (staff_id, start, end),
        )
        already_paid = float(cur.fetchone()[0] or 0)
        remaining = max(total_earnings - already_paid, 0.0)

        result = {
            "staff_id": staff_id,
            "role": role_name,
            "from": start.isoformat(),
            "to": end.isoformat(),
            "suggested_amount": round(remaining, 2),
        }
        if role_name != "doctor":
            result["total_earnings"] = round(total_earnings, 2)
            result["already_paid"] = round(already_paid, 2)
        return jsonify(result)
    finally:
        release_connection(conn)


@outcome_bp.route("/salaries", methods=["GET"])
@admin_required
def list_salary_payments():
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")

    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT sp.id,
                   sp.payment_date,
                   sp.amount,
                   sp.note,
                   s.first_name,
                   s.last_name
            FROM salary_payments sp
            JOIN staff s ON s.id = sp.staff_id
            WHERE sp.payment_date BETWEEN %s AND %s
            ORDER BY sp.payment_date DESC, sp.id DESC
            """,
            (start, end),
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = []
    for row in rows:
        items.append(
            {
                "id": row[0],
                "payment_date": row[1].isoformat(),
                "amount": float(row[2]),
                "note": row[3],
                "staff": {
                    "first_name": row[4],
                    "last_name": row[5],
                },
            }
        )

    return jsonify(items)


@outcome_bp.route("/salaries/<int:salary_id>", methods=["DELETE"])
@admin_required
def delete_salary_payment(salary_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE salary_withdrawal_audit
            SET salary_payment_id = NULL,
                status = 'deleted',
                error_code = COALESCE(error_code, 'deleted')
            WHERE salary_payment_id = %s
            """,
            (salary_id,),
        )
        cur = conn.cursor()
        cur.execute("DELETE FROM salary_payments WHERE id = %s", (salary_id,))
        if cur.rowcount == 0:
            conn.rollback()
            return jsonify({"error": "not_found"}), 404
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"}), 200


@outcome_bp.route("/staff/self/dashboard", methods=["GET"])
def staff_self_dashboard():
    user = get_current_user()
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    staff_id, role = user
    if role == "doctor":
        return jsonify({"error": "forbidden"}), 403
    today = date.today()
    start_param = request.args.get("from")
    end_param = request.args.get("to")
    start = parse_date(start_param) if start_param else today.replace(day=1)
    end = parse_date(end_param) if end_param else today

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id,
                   s.first_name,
                   s.last_name,
                   s.base_salary,
                   s.created_at,
                   r.name
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s AND s.is_active = TRUE
            """,
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid_staff"}), 400
        base_salary = float(row[3] or 0)
        employment_start = row[4].date().isoformat() if hasattr(row[4], "date") else row[4].isoformat()
        role_name = row[5]

        _ensure_timesheets_table(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT work_date, SUM(hours)
            FROM staff_timesheets
            WHERE staff_id = %s AND work_date BETWEEN %s AND %s
            GROUP BY work_date
            ORDER BY work_date
            """,
            (staff_id, start, end),
        )
        ts_rows = cur.fetchall()
        per_day: List[Dict[str, Any]] = []
        total_hours = 0.0
        total_regular = 0.0
        total_overtime = 0.0
        for d, hrs in ts_rows:
            h = float(hrs or 0)
            regular = min(h, 8.0)
            overtime = max(h - 8.0, 0.0)
            total_hours += h
            total_regular += regular
            total_overtime += overtime
            per_day.append(
                {
                    "date": d.isoformat(),
                    "hours": round(h, 2),
                    "regular_hours": round(regular, 2),
                    "overtime_hours": round(overtime, 2),
                }
            )

        base_rate = base_salary
        overtime_rate = base_rate * 1.5
        if role_name == "administrator":
            base_pay = base_salary
            overtime_pay = 0.0
            total_pay = base_salary
        else:
            base_pay = round(total_regular * base_rate, 2)
            overtime_pay = round(total_overtime * overtime_rate, 2)
            total_pay = round(base_pay + overtime_pay, 2)

        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, payment_date, amount, note
            FROM salary_payments
            WHERE staff_id = %s AND payment_date BETWEEN %s AND %s
            ORDER BY payment_date DESC, id DESC
            """,
            (staff_id, start, end),
        )
        pay_rows = cur.fetchall()
        payments = [
            {
                "id": r[0],
                "payment_date": r[1].isoformat(),
                "amount": float(r[2]),
                "note": r[3],
            }
            for r in pay_rows
        ]
    finally:
        release_connection(conn)

    return jsonify(
        {
            "staff": {
                "id": row[0],
                "first_name": row[1],
                "last_name": row[2],
                "role": role_name,
                "employment_start_date": employment_start,
                "base_salary": base_salary,
            },
            "period": {"from": start.isoformat(), "to": end.isoformat()},
            "hours": {
                "total_hours": round(total_hours, 2),
                "regular_hours": round(total_regular, 2),
                "overtime_hours": round(total_overtime, 2),
                "per_day": per_day,
            },
            "salary": {
                "base_rate": base_rate,
                "overtime_rate": round(overtime_rate, 2),
                "base_pay": base_pay,
                "overtime_pay": overtime_pay,
                "total_pay": total_pay,
                "bonuses": 0.0,
                "deductions": 0.0,
            },
            "payments": payments,
        }
    )


@outcome_bp.route("/salaries", methods=["POST"])
@admin_required
def create_salary_payment():
    data = request.get_json(silent=True) or {}

    staff_id = data.get("staff_id")
    if not staff_id:
        return jsonify({"error": "invalid_staff"}), 400

    try:
        amount = validate_amount(data.get("amount"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    payment_date_param = data.get("payment_date")
    payment_date = (
        parse_date(payment_date_param) if payment_date_param else date.today()
    )
    note = data.get("note")

    conn = get_connection()
    try:
        _ensure_salary_audit_table(conn)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id, r.name, s.base_salary
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s AND s.is_active = TRUE
            FOR UPDATE
            """,
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "invalid_staff"}), 400
        role_name = row[1]
        staff_base_salary = float(row[2] or 0)

        cycle_start = payment_date.replace(day=1)

        if role_name == "doctor":
            # ... existing doctor code ...
            try:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT COALESCE(SUM(ir.amount * s.commission_rate), 0)
                    FROM income_records ir
                    JOIN staff s ON s.id = ir.doctor_id
                    WHERE ir.doctor_id = %s AND ir.service_date BETWEEN %s AND %s
                    """,
                    (staff_id, cycle_start, payment_date),
                )
            except Exception:
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT COALESCE(SUM(ir.amount) * 0.30, 0)
                    FROM income_records ir
                    WHERE ir.doctor_id = %s AND ir.service_date BETWEEN %s AND %s
                    """,
                    (staff_id, cycle_start, payment_date),
                )
            total_earnings = float(cur.fetchone()[0] or 0)
        elif role_name == "administrator":
            total_earnings = staff_base_salary
        else:
            _ensure_timesheets_table(conn)
            cur = conn.cursor()
            cur.execute(
                """
                SELECT COALESCE(SUM(t.hours), 0) AS total_hours, s.base_salary
                FROM staff_timesheets t
                JOIN staff s ON s.id = t.staff_id
                WHERE t.staff_id = %s AND t.work_date BETWEEN %s AND %s
                GROUP BY s.base_salary
                """,
                (staff_id, cycle_start, payment_date),
            )
            ts_row = cur.fetchone()
            if not ts_row:
                total_earnings = 0.0
            else:
                total_hours = float(ts_row[0] or 0)
                base_salary = float(ts_row[1] or 0)
                total_earnings = round(total_hours * base_salary, 2)

        cur = conn.cursor()
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM salary_payments
            WHERE staff_id = %s
              AND payment_date BETWEEN %s AND %s
              AND (note IS NULL OR note NOT LIKE 'Commission from income #%%')
            """,
            (staff_id, cycle_start, payment_date),
        )
        already_paid = float(cur.fetchone()[0] or 0)

        decision = _evaluate_salary_withdrawal(total_earnings, already_paid, amount)
        if not decision["allowed"]:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO salary_withdrawal_audit
                    (staff_id, payment_date, requested_amount, processed_amount, status, error_code)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    staff_id,
                    payment_date,
                    amount,
                    decision["processed_amount"],
                    decision["status"],
                    decision["error_code"],
                ),
            )
            conn.commit()
            return (
                jsonify({"error": decision["error_code"]}),
                400,
            )

        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO salary_payments
                (staff_id, amount, payment_date, note)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (staff_id, amount, payment_date, note),
        )
        new_row = cur.fetchone()
        salary_payment_id = int(new_row[0])

        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO salary_withdrawal_audit
                (staff_id, salary_payment_id, payment_date, requested_amount, processed_amount, status, error_code)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                staff_id,
                salary_payment_id,
                payment_date,
                amount,
                decision["processed_amount"],
                decision["status"],
                decision["error_code"],
            ),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(new_row[0])}), 201


@outcome_bp.route("/summary/monthly", methods=["GET"])
@admin_required
def monthly_outcome_summary():
    items = _compute_monthly_outcome_summary()
    return jsonify(items)


def _compute_monthly_outcome_summary() -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        cur1 = conn.cursor()
        cur1.execute(
            """
            SELECT DATE_TRUNC('month', expense_date)::DATE AS month, SUM(amount) AS total
            FROM outcome_records
            GROUP BY DATE_TRUNC('month', expense_date)
            ORDER BY month
            """
        )
        outcome_rows = cur1.fetchall()

        cur2 = conn.cursor()
        cur2.execute(
            """
            SELECT DATE_TRUNC('month', payment_date)::DATE AS month, SUM(amount) AS total
            FROM salary_payments
            GROUP BY DATE_TRUNC('month', payment_date)
            ORDER BY month
            """
        )
        salary_rows = cur2.fetchall()
    finally:
        release_connection(conn)

    salaries_by_month: Dict[date, float] = {}
    for row in salary_rows:
        salaries_by_month[row[0]] = float(row[1])

    items = []
    for row in outcome_rows:
        month = row[0]
        outcome_total = float(row[1])
        salary_total = salaries_by_month.get(month, 0.0)
        items.append(
            {
                "month": month.isoformat(),
                "outcome_total": outcome_total,
                "salary_total": salary_total,
                "total_outcome": outcome_total + salary_total,
            }
        )

    return items


@outcome_bp.route("/summary/monthly/export/csv", methods=["GET"])
@admin_required
def export_monthly_outcome_csv():
    summary = _compute_monthly_outcome_summary()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["month", "outcome_total", "salary_total", "total_outcome"])
    for item in summary:
        writer.writerow(
            [
                item["month"],
                item["outcome_total"],
                item["salary_total"],
                item["total_outcome"],
            ]
        )

    csv_data = output.getvalue()

    return Response(
        csv_data,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=monthly_outcome.csv",
        },
    )
