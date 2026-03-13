
from datetime import datetime
from typing import List, Optional, Dict, Any
import json

from flask import Blueprint, jsonify, request
from .db import get_connection, release_connection

appointments_bp = Blueprint("appointments", __name__)

def parse_iso_datetime(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))

@appointments_bp.route("", methods=["GET"])
def list_appointments():
    start_str = request.args.get("start")
    end_str = request.args.get("end")
    doctor_id = request.args.get("doctor_id")
    
    if not start_str or not end_str:
        # Default to today if not provided? Or return error.
        # Let's return error to be safe.
        return jsonify({"error": "start and end dates are required"}), 400
        
    try:
        start_date = parse_iso_datetime(start_str)
        end_date = parse_iso_datetime(end_str)
    except ValueError:
        return jsonify({"error": "invalid_date_format"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        query = """
            SELECT a.id, a.doctor_id, a.patient_name, a.type, a.start_time, a.end_time, 
                   a.duration_minutes, a.status, a.note,
                   st.first_name, st.last_name, st.role_id, r.name as role_name
            FROM appointments a
            JOIN staff st ON a.doctor_id = st.id
            JOIN staff_roles r ON st.role_id = r.id
            WHERE a.start_time >= %s AND a.end_time <= %s
        """
        params = [start_date, end_date]
        
        if doctor_id:
            query += " AND a.doctor_id = %s"
            params.append(int(doctor_id))
            
        query += " ORDER BY a.start_time ASC"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        appointments = []
        for row in rows:
            try:
                if not row: continue
                (a_id, doc_id, p_name, a_type, start, end, dur, status, note, 
                 doc_first, doc_last, role_id, role_name) = row
                
                doc_name = f"{doc_first} {doc_last}"
                
                appointments.append({
                    "id": a_id,
                    "doctor_id": doc_id,
                    "patient_name": p_name,
                    "type": a_type,
                    "start": start.isoformat() if start else "",
                    "end": end.isoformat() if end else "",
                    "duration_minutes": dur,
                    "status": status,
                    "note": note,
                    "doctor_name": doc_name,
                    "role_name": role_name
                })
            except Exception as e:
                print(f"Error processing appointment row {row}: {e}")
                continue
            
        return jsonify(appointments)
    finally:
        release_connection(conn)

@appointments_bp.route("", methods=["POST"])
def create_appointment():
    data = request.get_json()
    if not data:
        return jsonify({"error": "no_data"}), 400
        
    required = ["doctor_id", "patient_name", "type", "start_time", "duration_minutes"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"missing_field_{field}"}), 400
            
    try:
        start_time = parse_iso_datetime(data["start_time"])
        duration = int(data["duration_minutes"])
        # Calculate end_time based on duration
        from datetime import timedelta
        end_time = start_time + timedelta(minutes=duration)
        
        doctor_id = int(data["doctor_id"])
        patient_name = data["patient_name"]
        apt_type = data["type"]
        status = data.get("status", "confirmed")
        note = data.get("note", "")
        
    except ValueError:
        return jsonify({"error": "invalid_data_format"}), 400

    conn = get_connection()
    try:
        cur = conn.cursor()
        
        # Check for overlaps? For now, let's allow overlaps but maybe warn?
        # The frontend handles visual overlaps.
        
        cur.execute(
            """
            INSERT INTO appointments (doctor_id, patient_name, type, start_time, end_time, duration_minutes, status, note)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (doctor_id, patient_name, apt_type, start_time, end_time, duration, status, note)
        )
        apt_id = cur.fetchone()[0]
        
        conn.commit()
        return jsonify({"id": apt_id, "status": "created"}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@appointments_bp.route("/<int:apt_id>", methods=["PUT"])
def update_appointment(apt_id):
    data = request.get_json()
    conn = get_connection()
    try:
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM appointments WHERE id = %s", (apt_id,))
        existing = cur.fetchone()
        if not existing:
            return jsonify({"error": "appointment_not_found"}), 404
            
        # Update fields
        # Note: existing tuple index depends on select * order. 
        # Better to just update what is provided.
        
        updates = []
        params = []
        
        if "doctor_id" in data:
            updates.append("doctor_id = %s")
            params.append(data["doctor_id"])
            
        if "patient_name" in data:
            updates.append("patient_name = %s")
            params.append(data["patient_name"])
            
        if "type" in data:
            updates.append("type = %s")
            params.append(data["type"])
            
        if "start_time" in data:
            updates.append("start_time = %s")
            params.append(parse_iso_datetime(data["start_time"]))
            
        if "duration_minutes" in data:
            updates.append("duration_minutes = %s")
            params.append(data["duration_minutes"])
            # Also update end_time
            # We need start_time to calc end_time. If start_time not in data, fetch from DB?
            # Complexity: simpler to require both or calc inside.
            # Let's assume if duration changes, we recalc end based on new or old start.
            
        if "status" in data:
            updates.append("status = %s")
            params.append(data["status"])
            
        if "note" in data:
            updates.append("note = %s")
            params.append(data["note"])
            
        if not updates:
            return jsonify({"status": "no_changes"}), 200
            
        # Handle end_time update if start or duration changed
        # This is a bit tricky with dynamic SQL construction.
        # Let's simplify: Just update provided fields. 
        # BUT end_time must be consistent.
        # If start_time or duration is updated, we MUST update end_time.
        
        # Let's do a fetch first to get current values
        cur.execute("SELECT start_time, duration_minutes FROM appointments WHERE id = %s", (apt_id,))
        curr_start, curr_dur = cur.fetchone()
        
        new_start = parse_iso_datetime(data["start_time"]) if "start_time" in data else curr_start
        new_dur = int(data["duration_minutes"]) if "duration_minutes" in data else curr_dur
        
        if "start_time" in data or "duration_minutes" in data:
            from datetime import timedelta
            new_end = new_start + timedelta(minutes=new_dur)
            updates.append("end_time = %s")
            params.append(new_end)
            
        updates.append("updated_at = NOW()")
        
        query = f"UPDATE appointments SET {', '.join(updates)} WHERE id = %s"
        params.append(apt_id)
        
        cur.execute(query, params)
        conn.commit()
        return jsonify({"status": "updated"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)

@appointments_bp.route("/<int:apt_id>", methods=["DELETE"])
def delete_appointment(apt_id):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM appointments WHERE id = %s", (apt_id,))
        if cur.rowcount == 0:
            return jsonify({"error": "appointment_not_found"}), 404
        conn.commit()
        return jsonify({"status": "deleted"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        release_connection(conn)
