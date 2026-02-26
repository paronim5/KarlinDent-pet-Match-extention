from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Dict, Optional, Tuple

import jwt
from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from .config import config
from .db import get_connection, release_connection


auth_bp = Blueprint("auth", __name__)


def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(
            (now + timedelta(minutes=config.ACCESS_TOKEN_EXPIRES_MINUTES)).timestamp()
        ),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, config.SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
    except jwt.PyJWTError as e:
        print(f"JWT decode error: {e}")
        return None


def get_token_from_header() -> Optional[str]:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        print("Authorization header missing")
        return None
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        print(f"Invalid Authorization header format: {auth_header}")
        return None
    return parts[1]


def get_current_user() -> Optional[Tuple[int, str]]:
    token = get_token_from_header()
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    return int(payload.get("sub")), str(payload.get("role"))


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            print("admin_required: User not found from token")
            return jsonify({"error": "unauthorized", "message": "User not found from token"}), 401
        user_id, role = user
        if role != "admin" and role != "administrator":
            print(f"admin_required: Forbidden for role {role}")
            return jsonify({"error": "forbidden", "message": f"Forbidden for role {role}"}), 403
        return fn(*args, **kwargs)

    return wrapper


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "invalid_credentials"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id, s.first_name, s.last_name, s.email, r.name, s.password_hash
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.email = %s AND s.is_active = TRUE
            """,
            (email,),
        )
        row = cur.fetchone()
    finally:
        release_connection(conn)

    if not row:
        return jsonify({"error": "invalid_credentials"}), 401

    user_id, first_name, last_name, user_email, role_name, password_hash = row

    if not password_hash or not check_password_hash(password_hash, password):
        return jsonify({"error": "invalid_credentials"}), 401

    token = create_access_token(user_id=user_id, role=role_name)

    return jsonify(
        {
            "access_token": token,
            "user": {
                "id": user_id,
                "first_name": first_name,
                "last_name": last_name,
                "email": user_email,
                "role": role_name,
            },
        }
    )


@auth_bp.route("/me", methods=["GET"])
@admin_required
def me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    user_id, role = user

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT s.id, s.first_name, s.last_name, s.email, r.name
            FROM staff s
            JOIN staff_roles r ON r.id = s.role_id
            WHERE s.id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
    finally:
        release_connection(conn)

    if not row:
        return jsonify({"error": "not_found"}), 404

    uid, first_name, last_name, email, role_name = row

    return jsonify(
        {
            "id": uid,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "role": role_name,
        }
    )
