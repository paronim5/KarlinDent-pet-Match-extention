import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api/client.js";

export default function StaffRolePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [timesheets, setTimesheets] = useState([]);
  const [staff, setStaff] = useState(null);
  const [saving, setSaving] = useState(false);
  const [payingSalary, setPayingSalary] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [documentFilter, setDocumentFilter] = useState({ from: today.slice(0, 7) + "-01", to: today });
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
      const msg = err.message;
      if (msg === "staff_not_found") setError("Staff member not found.");
      else if (msg === "invalid_staff") setError("Select a valid staff member.");
      else if (msg === "not_found") setError("Timesheets are unavailable for this staff member.");
      else setError(err.message || "Unable to load timesheets");
    }
  };

  const loadDocuments = async (rangeFrom, rangeTo) => {
    setDocumentsLoading(true);
    setDocumentsError("");
    try {
      const params = new URLSearchParams();
      params.set("type", "salary_report");
      if (rangeFrom) params.set("from", rangeFrom);
      if (rangeTo) params.set("to", rangeTo);
      const items = await api.get(`/staff/${id}/documents?${params.toString()}`);
      setDocuments(items);
    } catch (err) {
      setDocumentsError(err.message || "Unable to load salary documents");
    } finally {
      setDocumentsLoading(false);
    }
  };

  const getAuthHeaders = () => {
    const headers = {};
    const rawUser = localStorage.getItem("auth_user");
    if (!rawUser) return headers;
    try {
      const user = JSON.parse(rawUser);
      if (user?.id) headers["X-Staff-Id"] = String(user.id);
      if (user?.role) headers["X-Staff-Role"] = String(user.role);
    } catch {
    }
    return headers;
  };

  const downloadDocument = async (documentId, fallbackName) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/staff/${id}/documents/${documentId}/download`, { headers });
      if (!response.ok) {
        throw new Error("Unable to download document");
      }
      const blob = await response.blob();
      const fileName = fallbackName || "salary-report.pdf";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDocumentsError(err.message || "Unable to download document");
    }
  };

  const previewDocument = async (documentId) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/staff/${id}/documents/${documentId}/view`, { headers });
      if (!response.ok) {
        throw new Error("Unable to open document preview");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60000);
    } catch (err) {
      setDocumentsError(err.message || "Unable to open document preview");
    }
  };

  useEffect(() => {
    loadAll();
  }, [id]);

  useEffect(() => {
    setDocumentFilter({ from, to });
  }, [from, to]);

  useEffect(() => {
    if (documentFilter.from || documentFilter.to) {
      loadDocuments(documentFilter.from, documentFilter.to);
    }
  }, [id, documentFilter.from, documentFilter.to]);

  const totalHours = useMemo(
    () => timesheets.reduce((sum, t) => sum + t.hours, 0),
    [timesheets]
  );

  const totalWages = useMemo(() => {
    const base = staff && staff.base_salary ? Number(staff.base_salary) : 0;
    return Number((totalHours * base).toFixed(2));
  }, [staff, totalHours]);

  const baseRate = staff && staff.base_salary ? Number(staff.base_salary) : 0;

  const handleRecordSalary = async () => {
    setPayingSalary(true);
    setError("");
    try {
      if (!staff) {
        setError("Staff member not found.");
        return;
      }
      if (!from || !to) {
        setError("Select a valid date range.");
        return;
      }
      if (totalHours <= 0) {
        setError("No hours recorded for selected period.");
        return;
      }
      const params = new URLSearchParams();
      params.set("tab", "salary");
      params.set("staff_id", String(id));
      params.set("amount", totalWages.toFixed(2));
      params.set("from", from);
      params.set("to", to);
      navigate(`/outcome/add?${params.toString()}`);
    } finally {
      setPayingSalary(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!form.workDate || !form.startTime || !form.endTime) {
        setError("Please enter date, start time, and end time.");
        return;
      }
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
      const msg = err.message;
      if (msg === "invalid_time_range") setError("End time must be after start time.");
      else if (msg === "timesheet_not_found") setError("Shift not found.");
      else if (msg === "staff_not_found") setError("Staff member not found.");
      else if (msg === "invalid_data") setError("Enter valid shift details.");
      else setError(err.message || "Unable to save shift");
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
      const msg = err.message;
      if (msg === "timesheet_not_found") setError("Shift not found.");
      else setError(err.message || "Unable to delete shift");
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

  const title = staff ? staff.role.charAt(0).toUpperCase() + staff.role.slice(1) : "Staff member";

  return (
    <>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      <div className="two-col">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Timesheet Log</div>
              <div className="panel-meta">{timesheets.length} entries</div>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Hours</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.work_date}</td>
                    <td className="mono">{t.start_time.slice(0, 5)}</td>
                    <td className="mono">{t.end_time.slice(0, 5)}</td>
                    <td className="mono" style={{ color: "var(--accent)" }}>{t.hours.toFixed(2)}</td>
                    <td>
                      <button className="pay-btn" onClick={() => handleEdit(t)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="quick-form">
          <div className="panel" style={{ marginBottom: "16px" }}>
            <div className="panel-header">
              <div>
                <div className="panel-title">Salary Summary</div>
                <div className="panel-meta">{from} → {to}</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: "8px", padding: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Total Hours</span>
                <span className="mono">{totalHours.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Base Rate</span>
                <span className="mono">{baseRate.toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "600" }}>
                <span>Calculated Salary</span>
                <span className="mono">{totalWages.toLocaleString(undefined, { style: "currency", currency: "CZK" })}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" className="btn btn-primary" onClick={handleRecordSalary} disabled={payingSalary}>
                  {payingSalary ? "Recording..." : "Record Salary"}
                </button>
              </div>
            </div>
          </div>
          <div className="panel" style={{ marginBottom: "16px" }}>
            <div className="panel-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="panel-title">Salary Documents</div>
                <div className="panel-meta">Signed reports</div>
              </div>
              <div className="doc-filter-controls">
                <input
                  type="date"
                  value={documentFilter.from}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, from: e.target.value }))}
                  className="form-input doc-filter-input"
                />
                <span className="doc-filter-separator">-</span>
                <input
                  type="date"
                  value={documentFilter.to}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, to: e.target.value }))}
                  className="form-input doc-filter-input"
                />
                <button className="btn btn-ghost" onClick={() => loadDocuments(documentFilter.from, documentFilter.to)}>
                  Search
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Signed At</th>
                    <th>Signer</th>
                    <th>File</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documentsLoading && (
                    [...Array(3)].map((_, idx) => (
                      <tr key={`doc-${idx}`}>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                      </tr>
                    ))
                  )}
                  {!documentsLoading && documentsError && (
                    <tr>
                      <td colSpan={5} className="empty-state">{documentsError}</td>
                    </tr>
                  )}
                  {!documentsLoading && !documentsError && documents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty-state">No salary documents found</td>
                    </tr>
                  )}
                  {!documentsLoading && !documentsError && documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="mono">{doc.period_from || "—"} → {doc.period_to || "—"}</td>
                      <td className="mono">{doc.signed_at ? new Date(doc.signed_at).toLocaleString() : "—"}</td>
                      <td>{doc.signer_name || "—"}</td>
                      <td className="mono doc-filename">{doc.file_name || "salary-report.pdf"}</td>
                      <td>
                        <div className="doc-actions">
                          <button className="pay-btn" onClick={() => previewDocument(doc.id)}>
                            View
                          </button>
                          <button className="pay-btn" onClick={() => downloadDocument(doc.id, doc.file_name)}>
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel-title" style={{ marginBottom: '16px' }}>{editingId ? 'Edit Shift' : 'Add Shift'}</div>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div className="form-label">Date</div>
              <input className="form-input" type="date" value={form.workDate} onChange={(e) => setForm(p => ({...p, workDate: e.target.value}))} />
            </div>
            <div className="form-grid">
              <div>
                <div className="form-label">Start Time</div>
                <input className="form-input" type="time" value={form.startTime} onChange={(e) => setForm(p => ({...p, startTime: e.target.value}))} />
              </div>
              <div>
                <div className="form-label">End Time</div>
                <input className="form-input" type="time" value={form.endTime} onChange={(e) => setForm(p => ({...p, endTime: e.target.value}))} />
              </div>
            </div>
            <div>
              <div className="form-label">Note</div>
              <input className="form-input" placeholder="Shift details..." value={form.note} onChange={(e) => setForm(p => ({...p, note: e.target.value}))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              {editingId && <button type="button" className="btn btn-ghost" onClick={handleCancelEdit}>Cancel</button>}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : (editingId ? "Update Shift" : "+ Add Shift")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
