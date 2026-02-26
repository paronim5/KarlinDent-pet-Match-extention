import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useApi } from "../api/client.js";

export default function AssistantPage() {
  const { id } = useParams();
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [timesheets, setTimesheets] = useState([]);
  const [staff, setStaff] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    workDate: today,
    startTime: "09:00",
    endTime: "17:00",
    note: ""
  });

  const [editingId, setEditingId] = useState(null);

  const loadAll = async (rangeFrom = from, rangeTo = to) => {
    setError("");
    try {
      const [staffList, ts] = await Promise.all([
        api.get("/staff"),
        api.get(`/outcome/timesheets?staff_id=${id}&from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`)
      ]);
      const me = staffList.find((s) => String(s.id) === String(id));
      setStaff(me || null);
      setTimesheets(ts);
    } catch (err) {
      setError(err.message || "Unable to load timesheets");
    }
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  const totalHours = useMemo(
    () => timesheets.reduce((sum, t) => sum + t.hours, 0),
    [timesheets]
  );

  const totalWages = useMemo(() => {
    const base = staff && staff.base_salary ? Number(staff.base_salary) : 0;
    return (totalHours * base).toFixed(2);
  }, [staff, totalHours]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await api.put(`/outcome/timesheets/${editingId}`, {
          work_date: form.workDate,
          start_time: form.startTime,
          end_time: form.endTime,
          note: form.note || undefined
        });
      } else {
        await api.post("/outcome/timesheets", {
          staff_id: Number(id),
          work_date: form.workDate,
          start_time: form.startTime,
          end_time: form.endTime,
          note: form.note || undefined
        });
      }
      setForm({
        workDate: today,
        startTime: "09:00",
        endTime: "17:00",
        note: ""
      });
      setEditingId(null);
      await loadAll();
    } catch (err) {
      setError(err.message || "Unable to save shift");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (t) => {
    setEditingId(t.id);
    setForm({
      workDate: t.work_date,
      startTime: t.start_time.slice(0, 5),
      endTime: t.end_time.slice(0, 5),
      note: t.note || ""
    });
  };

  const handleDelete = async (tsId) => {
    if (!window.confirm("Are you sure you want to delete this shift?")) return;
    setError("");
    try {
      await api.delete(`/outcome/timesheets/${tsId}`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Unable to delete shift");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({
      workDate: today,
      startTime: "09:00",
      endTime: "17:00",
      note: ""
    });
  };

  const handlePeriodApply = async () => {
    await loadAll(from, to);
  };

  return (
    <div className="page page-staff-role">
      <div className="card-header">
        <h1>Assistant</h1>
        <div>
          <Link to="/staff">← Back to Staff</Link>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      <section className="grid grid-2">
        <div className="card">
          <h2>Timesheets</h2>
          <div className="date-range">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="button" onClick={handlePeriodApply}>Apply</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Hours</th>
                  <th>Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.work_date}</td>
                    <td>{t.start_time}</td>
                    <td>{t.end_time}</td>
                    <td>{t.hours.toFixed(2)}</td>
                    <td>{t.note || ""}</td>
                    <td>
                      <button type="button" className="btn-secondary btn-small" onClick={() => handleEdit(t)}>Edit</button>
                      <button type="button" className="btn-danger btn-small" onClick={() => handleDelete(t.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {timesheets.length === 0 && (
                  <tr>
                    <td colSpan={6}>No timesheets for selected period</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <form className="card" onSubmit={handleAdd}>
          <h2>{editingId ? "Edit shift" : "Add shift"}</h2>
          <label>
            Date
            <input
              type="date"
              value={form.workDate}
              onChange={(e) => setForm((p) => ({ ...p, workDate: e.target.value }))}
            />
          </label>
          <label>
            Start time
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
            />
          </label>
          <label>
            End time
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
            />
          </label>
          <label>
            Note
            <input
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <div className="button-row">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : (editingId ? "Update shift" : "Save shift")}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={handleCancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Totals</h2>
        </div>
        <div className="metric">
          <div className="metric-label">Total hours</div>
          <div className="metric-value">{totalHours.toFixed(2)} h</div>
        </div>
        <div className="metric">
          <div className="metric-label">Calculated wages</div>
          <div className="metric-value">
            {Number(totalWages).toLocaleString(undefined, { style: "currency", currency: "CZK" })}
          </div>
        </div>
      </section>
    </div>
  );
}
