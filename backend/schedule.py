from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import json
import io

from flask import Blueprint, jsonify, request, send_file
import psycopg2

from .db import get_connection, release_connection
from .staff import get_role_id

schedule_bp = Blueprint("schedule", __name__)

def parse_iso_datetime(dt_str: str) -> datetime:
    # Handles ISO format like '2023-10-27T10:00:00.000Z' or '2023-10-27T10:00:00'
    return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))

def check_conflicts(cur, staff_id: int, start_time: datetime, end_time: datetime, exclude_shift_id: Optional[int] = None) -> List[Dict[str, Any]]:
    query = """
        SELECT s.id, s.start_time, s.end_time, st.first_name, st.last_name
        FROM shifts s
        JOIN staff st ON s.staff_id = st.id
        WHERE s.staff_id = %s
          AND s.start_time < %s
          AND s.end_time > %s
    """
    params = [staff_id, end_time, start_time]
    
    if exclude_shift_id:
        query += " AND s.id != %s"
        params.append(exclude_shift_id)
        
    cur.execute(query, params)
    rows = cur.fetchall()
    
    conflicts = []
    for row in rows:
        conflicts.append({
            "id": row[0],
            "start_time": row[1].isoformat(),
            "end_time": row[2].isoformat(),
            "staff_name": f"{row[3]} {row[4]}"
        })
    return conflicts

def log_audit(cur, action: str, shift_id: Optional[int], details: Dict[str, Any], user_id: Optional[int] = None):
    # If we had a real user session, we would use user_id. 
    # For now, we might pass a mock admin ID or leave it null if unknown.
    # We will assume user_id=1 (Admin) for this implementation if not provided.
    admin_id = user_id or 1 
    
    cur.execute(
        """
        INSERT INTO schedule_audit_logs (shift_id, action, changed_by, details)
        VALUES (%s, %s, %s, %s)
        """,
        (shift_id, action, admin_id, json.dumps(details, default=str))
    )

def send_notification(staff_id: int, message: str):
    # In a real app, this would send an email or push notification
    # For now, we simulate it by logging to stdout.
    print(f"[NOTIFICATION] To Staff ID {staff_id}: {message}")

def ensure_schedule_schema(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS shifts (
            id              SERIAL PRIMARY KEY,
            staff_id        INT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
            start_time      TIMESTAMPTZ NOT NULL,
            end_time        TIMESTAMPTZ NOT NULL,
            note            TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_time ON shifts (start_time, end_time)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shifts_staff ON shifts (staff_id)")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schedule_audit_logs (
            id              SERIAL PRIMARY KEY,
            shift_id        INT,
            action          VARCHAR(20) NOT NULL,
            changed_by      INT REFERENCES staff(id),
            details         TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_schedule_audit_logs_shift ON schedule_audit_logs (shift_id)")

@schedule_bp.route("", methods=["GET"])
def list_shifts():
    start_str = request.args.get("start")
    end_str = request.args.get("end")
    staff_id = request.args.get("staff_id")
    
    if not start_str or not end_str:
        return jsonify({"error": "start and end dates are required"}), 400
        
    try:
        start_date = parse_iso_datetime(start_str)
        end_date = parse_iso_datetime(end_str)
    except ValueError:
        return jsonify({"error": "invalid_date_format"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        query = """
            SELECT s.id, s.staff_id, s.start_time, s.end_time, s.note, 
                   st.first_name, st.last_name, r.name as role_name, r.id as role_id
            FROM shifts s
            JOIN staff st ON s.staff_id = st.id
            JOIN staff_roles r ON st.role_id = r.id
            WHERE s.start_time >= %s AND s.end_time <= %s
        """
        params = [start_date, end_date]
        
        if staff_id:
            query += " AND s.staff_id = %s"
            params.append(int(staff_id))
            
        query += " ORDER BY s.start_time ASC"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        shifts = []
        for row in rows:
            try:
                # Ensure we have data
                if not row:
                    continue
                    
                s_id, s_staff_id, s_start, s_end, s_note, st_first, st_last, r_name, r_id = row
                
                # Handle potentially None dates (should happen due to schema, but for safety)
                start_iso = s_start.isoformat() if s_start else ""
                end_iso = s_end.isoformat() if s_end else ""
                
                # Handle names
                full_name = f"{st_first or ''} {st_last or ''}".strip()
                
                shifts.append({
                    "id": s_id,
                    "staff_id": s_staff_id,
                    "start": start_iso,
                    "end": end_iso,
                    "title": full_name,
                    "note": s_note,
                    "staff_name": full_name,
                    "role": r_name,
                    "role_id": r_id,
                    "resourceId": s_staff_id
                })
            except Exception as e:
                print(f"Error processing shift row {row}: {e}")
                continue
            
        return jsonify(shifts)
    except Exception as e:
        print(f"Error in list_shifts: {e}")
        return jsonify({"error": "internal_server_error", "message": "An unexpected error occurred"}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("", methods=["POST"])
def create_shift():
    data = request.get_json()
    if not data:
        return jsonify({"error": "no_data"}), 400
        
    required = ["staff_id", "start_time", "end_time"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"missing_field_{field}"}), 400
            
    try:
        start_time = parse_iso_datetime(data["start_time"])
        end_time = parse_iso_datetime(data["end_time"])
        staff_id = int(data["staff_id"])
        note = data.get("note", "")
        
        if end_time <= start_time:
            return jsonify({"error": "end_time_must_be_after_start_time"}), 400
            
    except ValueError:
        return jsonify({"error": "invalid_data_format"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        
        # Conflict detection
        conflicts = check_conflicts(cur, staff_id, start_time, end_time)
        if conflicts and not data.get("force", False):
            return jsonify({"error": "conflict_detected", "conflicts": conflicts}), 409
            
        cur.execute(
            """
            INSERT INTO shifts (staff_id, start_time, end_time, note)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (staff_id, start_time, end_time, note)
        )
        shift_id = cur.fetchone()[0]
        
        # Audit Log
        log_audit(cur, "CREATE", shift_id, data)
        
        # Notify
        send_notification(staff_id, f"New shift assigned: {start_time} - {end_time}")

        conn.commit()
        return jsonify({"id": shift_id, "status": "created"}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/<int:shift_id>", methods=["PUT"])
def update_shift(shift_id):
    data = request.get_json()
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        
        # Get existing shift
        cur.execute("SELECT staff_id, start_time, end_time, note FROM shifts WHERE id = %s", (shift_id,))
        existing = cur.fetchone()
        if not existing:
            return jsonify({"error": "shift_not_found"}), 404
            
        current_staff_id = existing[0]
        
        # Update fields
        staff_id = int(data.get("staff_id", current_staff_id))
        start_time = parse_iso_datetime(data["start_time"]) if "start_time" in data else existing[1]
        end_time = parse_iso_datetime(data["end_time"]) if "end_time" in data else existing[2]
        note = data.get("note", existing[3])
        
        # Conflict detection if time or staff changed
        if staff_id != current_staff_id or "start_time" in data or "end_time" in data:
            conflicts = check_conflicts(cur, staff_id, start_time, end_time, exclude_shift_id=shift_id)
            if conflicts and not data.get("force", False):
                return jsonify({"error": "conflict_detected", "conflicts": conflicts}), 409
        
        cur.execute(
            """
            UPDATE shifts 
            SET staff_id = %s, start_time = %s, end_time = %s, note = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (staff_id, start_time, end_time, note, shift_id)
        )
        
        # Audit Log
        log_audit(cur, "UPDATE", shift_id, {"old": existing, "new": data})
        
        # Notify
        send_notification(staff_id, f"Shift updated: {start_time} - {end_time}")
        if staff_id != current_staff_id:
             send_notification(current_staff_id, f"Shift removed: {existing[1]} - {existing[2]}")

        conn.commit()
        return jsonify({"status": "updated"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/<int:shift_id>", methods=["DELETE"])
def delete_shift(shift_id):
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        
        cur.execute("SELECT * FROM shifts WHERE id = %s", (shift_id,))
        existing = cur.fetchone()
        if not existing:
            return jsonify({"error": "shift_not_found"}), 404
            
        cur.execute("DELETE FROM shifts WHERE id = %s", (shift_id,))
        
        # Audit Log
        log_audit(cur, "DELETE", shift_id, {"deleted_record": existing})
        
        # Notify
        send_notification(existing[1], f"Shift cancelled: {existing[2]} - {existing[3]}")

        conn.commit()
        return jsonify({"status": "deleted"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@schedule_bp.route("/export", methods=["GET"])
def export_schedule():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet

    start_str = request.args.get("start")
    end_str = request.args.get("end")
    
    if not start_str or not end_str:
        return jsonify({"error": "start and end dates are required"}), 400
        
    try:
        start_date = parse_iso_datetime(start_str)
        end_date = parse_iso_datetime(end_str)
    except ValueError:
        return jsonify({"error": "invalid_date_format"}), 400
        
    conn = get_connection()
    try:
        cur = conn.cursor()
        ensure_schedule_schema(cur)
        query = """
            SELECT s.start_time, s.end_time, st.first_name, st.last_name, r.name, s.note
            FROM shifts s
            JOIN staff st ON s.staff_id = st.id
            JOIN staff_roles r ON st.role_id = r.id
            WHERE s.start_time >= %s AND s.end_time <= %s
            ORDER BY s.start_time ASC, st.last_name ASC
        """
        cur.execute(query, (start_date, end_date))
        rows = cur.fetchall()
    finally:
        release_connection(conn)
        
    # Generate PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4))
    elements = []
    styles = getSampleStyleSheet()
    
    elements.append(Paragraph(f"Schedule Report: {start_str[:10]} to {end_str[:10]}", styles['Title']))
    elements.append(Spacer(1, 20))
    
    data = [["Date", "Time", "Staff Member", "Role", "Notes"]]
    for row in rows:
        date_str = row[0].strftime("%Y-%m-%d")
        time_str = f"{row[0].strftime('%H:%M')} - {row[1].strftime('%H:%M')}"
        name = f"{row[2]} {row[3]}"
        role = row[4]
        note = row[5] or ""
        data.append([date_str, time_str, name, role, note])
        
    table = Table(data, colWidths=[80, 100, 150, 100, 200])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    
    elements.append(table)
    doc.build(elements)
    
    buffer.seek(0)
    return send_file(
        buffer,
        as_attachment=True,
        download_name=f"schedule_{start_str[:10]}_{end_str[:10]}.pdf",
        mimetype='application/pdf'
    )
