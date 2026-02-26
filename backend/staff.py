from typing import Any, Dict, List, Optional

import psycopg2
from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from .auth import admin_required
from .config import config
from .db import get_connection, release_connection


staff_bp = Blueprint("staff", __name__)


def validate_salary(value: Any) -> float:
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_salary")
    if amount < 0:
        raise ValueError("invalid_salary")
    return round(amount, 2)


def get_role_id(conn, role_name: str) -> Optional[int]:
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM staff_roles WHERE name = %s",
        (role_name,),
    )
    row = cur.fetchone()
    return int(row[0]) if row else None


@staff_bp.route("/roles", methods=["GET"])
@admin_required
def list_roles():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, name
            FROM staff_roles
            ORDER BY name
            """
        )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = [{"id": row[0], "name": row[1]} for row in rows]
    return jsonify(items)


@staff_bp.route("", methods=["GET"])
@admin_required
def list_staff():
    role = request.args.get("role")
    q = request.args.get("q", "").strip()

    conn = get_connection()
    try:
        cur = conn.cursor()
        params: List[Any] = []
        conditions: List[str] = ["s.is_active = TRUE"]

        if role:
            conditions.append("r.name = %s")
            params.append(role)

        if q:
            pattern = f"%{q.lower()}%"
            conditions.append(
                "(LOWER(s.first_name) LIKE %s OR LOWER(s.last_name) LIKE %s OR LOWER(s.email) LIKE %s)"
            )
            params.extend([pattern, pattern, pattern])

        condition_sql = " AND ".join(conditions)

        try:
            cur.execute(
                f"""
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.phone,
                       s.email,
                       s.bio,
                       s.base_salary,
                       s.commission_rate,
                       s.last_paid_at,
                       s.total_revenue,
                       s.is_active,
                       r.name,
                       COALESCE(SUM(sp.amount), 0) AS commission_income
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE {condition_sql}
                GROUP BY s.id,
                         s.first_name,
                         s.last_name,
                         s.phone,
                         s.email,
                         s.bio,
                         s.base_salary,
                         s.commission_rate,
                         s.last_paid_at,
                         s.total_revenue,
                         s.is_active,
                         r.name
                ORDER BY r.name, s.last_name, s.first_name
                """,
                params,
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT s.id,
                       s.first_name,
                       s.last_name,
                       s.phone,
                       s.email,
                       s.bio,
                       s.base_salary,
                       0 AS commission_rate,
                       s.last_paid_at,
                       s.total_revenue,
                       s.is_active,
                       r.name,
                       COALESCE(SUM(sp.amount), 0) AS commission_income
                FROM staff s
                JOIN staff_roles r ON r.id = s.role_id
                LEFT JOIN salary_payments sp ON sp.staff_id = s.id
                WHERE {condition_sql}
                GROUP BY s.id,
                         s.first_name,
                         s.last_name,
                         s.phone,
                         s.email,
                         s.bio,
                         s.base_salary,
                         s.last_paid_at,
                         s.total_revenue,
                         s.is_active,
                         r.name
                ORDER BY r.name, s.last_name, s.first_name
                """,
                params,
            )
        rows = cur.fetchall()
    finally:
        release_connection(conn)

    items = []
    for row in rows:
        base_salary = float(row[6])
        commission_rate = float(row[7])
        last_paid_at = row[8].isoformat() if row[8] else None
        total_revenue = float(row[9])
        is_active = bool(row[10])
        role_name = row[11]
        commission_income = float(row[12])

        if commission_rate == 0:
            if total_revenue > 0 and commission_income > 0:
                commission_rate = commission_income / total_revenue
            elif total_revenue > 0 and commission_income == 0 and role_name == "doctor":
                commission_rate = config.DOCTOR_COMMISSION_RATE
        if commission_income == 0 and role_name == "doctor" and total_revenue > 0 and commission_rate > 0:
            commission_income = round(total_revenue * commission_rate, 2)

        items.append(
            {
                "id": row[0],
                "first_name": row[1],
                "last_name": row[2],
                "phone": row[3],
                "email": row[4],
                "bio": row[5],
                "base_salary": base_salary,
                "commission_rate": commission_rate,
                "last_paid_at": last_paid_at,
                "total_revenue": total_revenue,
                "commission_income": commission_income,
                "is_active": is_active,
                "role": role_name,
            }
        )

    return jsonify(items)


@staff_bp.route("", methods=["POST"])
@admin_required
def create_staff():
    data = request.get_json(silent=True) or {}

    first_name = data.get("first_name")
    last_name = data.get("last_name")
    phone = data.get("phone")
    email = data.get("email")
    bio = data.get("bio")
    role_name = data.get("role")

    if not first_name or not last_name or not role_name:
        return jsonify({"error": "invalid_staff"}), 400

    base_salary_value = data.get("base_salary", 0)
    commission_rate_value = data.get("commission_rate", 0)

    try:
        base_salary = validate_salary(base_salary_value)
        commission_rate = float(commission_rate_value or 0)
        if commission_rate < 0 or commission_rate > 1:
            raise ValueError("invalid_commission_rate")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    commission_rate = round(commission_rate, 4)

    conn = get_connection()
    try:
        cur = conn.cursor()
        role_id = get_role_id(conn, role_name)
        if not role_id:
            return jsonify({"error": "invalid_role"}), 400

        if role_name == "doctor":
            base_salary_db = 0
            commission_rate_db = commission_rate
        else:
            base_salary_db = base_salary
            commission_rate_db = 0

        try:
            cur.execute(
                """
                INSERT INTO staff
                    (role_id, first_name, last_name, phone, email, bio, base_salary, commission_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    role_id,
                    first_name,
                    last_name,
                    phone,
                    email,
                    bio,
                    base_salary_db,
                    commission_rate_db,
                ),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO staff
                    (role_id, first_name, last_name, phone, email, bio, base_salary)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    role_id,
                    first_name,
                    last_name,
                    phone,
                    email,
                    bio,
                    base_salary_db,
                ),
            )
        row = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"id": int(row[0])}), 201


@staff_bp.route("/<int:staff_id>", methods=["DELETE"])
@admin_required
def deactivate_staff(staff_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM staff WHERE id = %s AND is_active = TRUE",
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404

        cur.execute(
            "UPDATE staff SET is_active = FALSE WHERE id = %s",
            (staff_id,),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@staff_bp.route("/<int:staff_id>/restore", methods=["POST"])
@admin_required
def restore_staff(staff_id: int):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM staff WHERE id = %s AND is_active = FALSE",
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404

        cur.execute(
            "UPDATE staff SET is_active = TRUE WHERE id = %s",
            (staff_id,),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@staff_bp.route("/<int:staff_id>/password", methods=["POST"])
@admin_required
def set_staff_password(staff_id: int):
    data = request.get_json(silent=True) or {}
    password = data.get("password")

    if not password or len(password) < 8:
        return jsonify({"error": "invalid_password"}), 400

    password_hash = generate_password_hash(password)

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM staff WHERE id = %s",
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404

        cur.execute(
            "UPDATE staff SET password_hash = %s WHERE id = %s",
            (password_hash, staff_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok"})


@staff_bp.route("/<int:staff_id>/commission", methods=["POST"])
@admin_required
def update_staff_commission(staff_id: int):
    data = request.get_json(silent=True) or {}
    commission_rate_value = data.get("commission_rate")

    try:
        commission_rate = float(commission_rate_value or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_commission_rate"}), 400

    if commission_rate < 0 or commission_rate > 1:
        return jsonify({"error": "invalid_commission_rate"}), 400

    commission_rate = round(commission_rate, 4)

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s AND r.name = 'doctor' AND s.is_active = TRUE
            """,
            (staff_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "staff_not_found"}), 404

        try:
            cur.execute(
                "UPDATE staff SET commission_rate = %s WHERE id = %s",
                (commission_rate, staff_id),
            )
        except psycopg2.errors.UndefinedColumn:
            conn.rollback()
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    ALTER TABLE staff
                    ADD COLUMN commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0
                    """
                )
                conn.commit()
            except psycopg2.errors.DuplicateColumn:
                conn.rollback()
            cur = conn.cursor()
            cur.execute(
                "UPDATE staff SET commission_rate = %s WHERE id = %s",
                (commission_rate, staff_id),
            )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        release_connection(conn)

    return jsonify({"status": "ok", "commission_rate": commission_rate})
