import { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="date-range">
      <label>
        From
        <input
          type="date"
          value={from}
          onChange={(event) => onChange({ from: event.target.value, to })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={to}
          onChange={(event) => onChange({ from, to: event.target.value })}
        />
      </label>
    </div>
  );
}

export default function IncomePage() {
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);

  const [records, setRecords] = useState([]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [patients, setPatients] = useState([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [statsQuery, setStatsQuery] = useState("");
  const [doctorStats, setDoctorStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [form, setForm] = useState({
    patientId: "",
    newPatientLastName: "",
    newPatientPhone: "",
    newPatientEmail: "",
    doctorId: "",
    amount: "",
    paymentMethod: "cash",
    note: ""
  });
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deletingIds, setDeletingIds] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const loadRecords = async (rangeFrom = from, rangeTo = to) => {
    setLoading(true);
    setError("");
    try {
      const items = await api.get(
        `/income/records?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(
          rangeTo
        )}`
      );
      setRecords(items);
      setSelectedIds([]);
    } catch (err) {
      setError(err.message || "Unable to load income records");
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const items = await api.get("/staff?role=doctor");
      setDoctors(items);
    } catch {
      setDoctors([]);
    }
  };

  const searchPatients = async (query) => {
    try {
      const items = await api.get(`/income/patients?q=${encodeURIComponent(query)}`);
      setPatients(items);
    } catch {
      setPatients([]);
    }
  };

  const loadDoctorStats = async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setDoctorStats(null);
      return;
    }
    setStatsLoading(true);
    setError("");
    try {
      const data = await api.get(
        `/income/stats/doctors-by-patient?patient_last_name=${encodeURIComponent(trimmed)}`
      );
      setDoctorStats(data);
    } catch (err) {
      setDoctorStats(null);
      setError(err.message || "Unable to load doctor statistics");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
    loadDoctors();
    searchPatients("");
  }, []);

  const handleRangeChange = ({ from: newFrom, to: newTo }) => {
    setFrom(newFrom);
    setTo(newTo);
    if (newFrom && newTo) {
      loadRecords(newFrom, newTo);
    }
  };

  const handlePatientSearchChange = (event) => {
    const query = event.target.value;
    setPatientQuery(query);
    searchPatients(query);
  };

  const handleStatsSearch = () => {
    loadDoctorStats(statsQuery);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        doctor_id: form.doctorId ? Number(form.doctorId) : null,
        amount: Number(form.amount),
        payment_method: form.paymentMethod,
        note: form.note || undefined
      };

      if (form.patientId) {
        payload.patient_id = Number(form.patientId);
      } else {
        payload.patient = {
          last_name: form.newPatientLastName,
          phone: form.newPatientPhone || undefined,
          email: form.newPatientEmail || undefined
        };
      }

      await api.post("/income/records", payload);
      setForm({
        patientId: "",
        newPatientLastName: "",
        newPatientPhone: "",
        newPatientEmail: "",
        doctorId: "",
        amount: "",
        paymentMethod: "cash",
        note: ""
      });
      await loadRecords();
    } catch (err) {
      setError(err.message || "Unable to save income record");
    } finally {
      setSaving(false);
    }
  };

  const dailyTotal = useMemo(
    () => records.reduce((sum, item) => sum + item.amount, 0),
    [records]
  );

  const paymentTotals = useMemo(() => {
    return records.reduce(
      (acc, item) => {
        const value = item.amount || 0;
        if (item.payment_method === "card") {
          acc.card += value;
        } else if (item.payment_method === "cash") {
          acc.cash += value;
        }
        acc.total += value;
        return acc;
      },
      { cash: 0, card: 0, total: 0 }
    );
  }, [records]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((r) => r.id));
    }
  };

  const isDeleting = (id) => deletingIds.includes(id);

  const performDelete = async (ids) => {
    setDeletingIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/income/records/${id}`);
      }
      await loadRecords();
    } catch (err) {
      setError(err.message || "Unable to delete income records");
    } finally {
      setDeletingIds([]);
      setConfirmState(null);
    }
  };

  const doctorComparisonData = useMemo(() => {
    if (!doctorStats || !doctorStats.doctors || doctorStats.doctors.length === 0) {
      return null;
    }
    const labels = doctorStats.doctors.map(
      (doc) => `${doc.last_name} ${doc.first_name}`
    );
    const incomeData = doctorStats.doctors.map((doc) => doc.total_income);
    const commissionData = doctorStats.doctors.map((doc) => doc.total_commission);
    return {
      labels,
      datasets: [
        {
          label: "Total income",
          data: incomeData,
          backgroundColor: "rgba(54, 162, 235, 0.7)"
        },
        {
          label: "Total commission",
          data: commissionData,
          backgroundColor: "rgba(75, 192, 192, 0.7)"
        }
      ]
    };
  }, [doctorStats]);

  const monthlyTrendsData = useMemo(() => {
    if (!doctorStats || !doctorStats.doctors || doctorStats.doctors.length === 0) {
      return null;
    }
    const monthSet = new Set();
    doctorStats.doctors.forEach((doc) => {
      doc.monthly.forEach((item) => {
        monthSet.add(item.month);
      });
    });
    const labels = Array.from(monthSet).sort();
    if (labels.length === 0) {
      return null;
    }
    const datasets = doctorStats.doctors.map((doc, index) => {
      const color =
        index % 3 === 0
          ? "rgba(54, 162, 235, 1)"
          : index % 3 === 1
          ? "rgba(255, 99, 132, 1)"
          : "rgba(75, 192, 192, 1)";
      return {
        label: `${doc.last_name} ${doc.first_name}`,
        data: labels.map((label) => {
          const item = doc.monthly.find((m) => m.month === label);
          return item ? item.total_income : 0;
        }),
        borderColor: color,
        backgroundColor: color,
        tension: 0.2
      };
    });
    return { labels, datasets };
  }, [doctorStats]);

  const doctorPatientRows = useMemo(() => {
    if (!doctorStats || !doctorStats.doctors || doctorStats.doctors.length === 0) {
      return [];
    }
    const rows = [];
    doctorStats.doctors.forEach((doc) => {
      doc.patients.forEach((patient) => {
        rows.push({
          doctorId: doc.id,
          doctorName: `${doc.last_name} ${doc.first_name}`,
          patientId: patient.id,
          patientName: `${patient.last_name} ${patient.first_name}`,
          totalIncome: patient.total_income,
          totalCommission: patient.total_commission
        });
      });
    });
    return rows;
  }, [doctorStats]);

  return (
    <div className="page page-income">
      <h1>Income</h1>
      {error && <div className="form-error">{error}</div>}
      <section className="card">
        <h2>Record patient payment</h2>
        <form className="grid grid-3" onSubmit={handleSubmit}>
          <div className="field-group">
            <label>
              Search patient
              <input
                type="text"
                value={patientQuery}
                onChange={handlePatientSearchChange}
                placeholder="Type name or email"
              />
            </label>
            <label>
              Select existing patient
              <select
                value={form.patientId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, patientId: event.target.value }))
                }
              >
                <option value="">New patient</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.last_name} {patient.first_name}
                  </option>
                ))}
              </select>
            </label>
            {!form.patientId && (
              <>
                <label>
                  Last name
                  <input
                    required
                    value={form.newPatientLastName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, newPatientLastName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={form.newPatientPhone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, newPatientPhone: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={form.newPatientEmail}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, newPatientEmail: event.target.value }))
                    }
                  />
                </label>
              </>
            )}
          </div>
          <div className="field-group">
            <label>
              Doctor
              <select
                required
                value={form.doctorId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, doctorId: event.target.value }))
                }
              >
                <option value="">Select doctor</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.last_name} {doc.first_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, amount: event.target.value }))
                }
              />
            </label>
            <label>
              Payment method
              <select
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
                }
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </select>
            </label>
            <label>
              Note
              <textarea
                rows={3}
                value={form.note}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save payment"}
            </button>
          </div>
          <div className="field-group">
            <h3>Today summary</h3>
            <div className="metric">
              <div className="metric-label">Total income</div>
              <div className="metric-value">
                {dailyTotal.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Cash</div>
              <div className="metric-value">
                {paymentTotals.cash.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Card</div>
              <div className="metric-value">
                {paymentTotals.card.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
          </div>
        </form>
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Doctor income statistics</h2>
        </div>
        <div className="grid grid-2">
          <div className="field-group">
            <label>
              Patient surname
              <input
                type="text"
                value={statsQuery}
                onChange={(event) => setStatsQuery(event.target.value)}
                placeholder="Type patient last name"
              />
            </label>
            <button
              type="button"
              onClick={handleStatsSearch}
              disabled={statsLoading || !statsQuery.trim()}
            >
              {statsLoading ? "Searching..." : "Search"}
            </button>
            {doctorStats && doctorStats.doctors && doctorStats.doctors.length === 0 && (
              <div>No data for entered surname</div>
            )}
            {doctorStats && doctorStats.doctors && doctorStats.doctors.length > 0 && (
              <>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Doctor</th>
                        <th>Patients</th>
                        <th>Visits</th>
                        <th>Total income</th>
                        <th>Total commission</th>
                        <th>Avg commission per patient</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctorStats.doctors.map((doc) => (
                        <tr key={doc.id}>
                          <td>
                            {doc.last_name} {doc.first_name}
                          </td>
                          <td>{doc.patient_count}</td>
                          <td>{doc.visit_count}</td>
                          <td>
                            {doc.total_income.toLocaleString(undefined, {
                              style: "currency",
                              currency: "CZK"
                            })}
                          </td>
                          <td>
                            {doc.total_commission.toLocaleString(undefined, {
                              style: "currency",
                              currency: "CZK"
                            })}
                          </td>
                          <td>
                            {doc.avg_commission_per_patient.toLocaleString(undefined, {
                              style: "currency",
                              currency: "CZK"
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {doctorPatientRows.length > 0 && (
                  <>
                    <h3>Doctor–patient breakdown</h3>
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            <th>Doctor</th>
                            <th>Patient</th>
                            <th>Income from patient</th>
                            <th>Commission from patient</th>
                          </tr>
                        </thead>
                        <tbody>
                          {doctorPatientRows.map((row) => (
                            <tr key={`${row.doctorId}-${row.patientId}`}>
                              <td>{row.doctorName}</td>
                              <td>{row.patientName}</td>
                              <td>
                                {row.totalIncome.toLocaleString(undefined, {
                                  style: "currency",
                                  currency: "CZK"
                                })}
                              </td>
                              <td>
                                {row.totalCommission.toLocaleString(undefined, {
                                  style: "currency",
                                  currency: "CZK"
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="field-group">
            {doctorComparisonData && (
              <>
                <h3>Doctor comparison</h3>
                <Bar
                  data={doctorComparisonData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        position: "bottom"
                      }
                    }
                  }}
                />
              </>
            )}
            {monthlyTrendsData && (
              <>
                <h3>Monthly income trends</h3>
                <Line
                  data={monthlyTrendsData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        position: "bottom"
                      }
                    }
                  }}
                />
              </>
            )}
          </div>
        </div>
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Income records</h2>
          <DateRangePicker
            from={from}
            to={to}
            onChange={handleRangeChange}
          />
          <div className="button-row hidden-mobile">
            <button
              type="button"
              className="btn-secondary"
              disabled={selectedIds.length === 0}
              onClick={() =>
                setConfirmState({ type: "bulk", ids: selectedIds.slice() })
              }
            >
              <span>Delete selected payments</span>
            </button>
          </div>
        </div>
        {loading ? (
          <div className="spinner" aria-label="Loading payments" />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all payments"
                      checked={
                        records.length > 0 &&
                        selectedIds.length === records.length
                      }
                      onChange={selectAllVisible}
                    />
                  </th>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Note</th>
                  <th className="hidden-mobile">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className={
                      selectedIds.includes(record.id)
                        ? "swipe-delete swipe-delete-active"
                        : "swipe-delete"
                    }
                    onTouchStart={(event) =>
                      (event.currentTarget.dataset.touchStartX =
                        event.touches[0].clientX)
                    }
                    onTouchEnd={(event) => {
                      const startX = Number(
                        event.currentTarget.dataset.touchStartX || 0
                      );
                      const endX = event.changedTouches[0].clientX;
                      if (startX - endX > 40) {
                        setConfirmState({ type: "single", ids: [record.id] });
                      }
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label="Select payment"
                        checked={selectedIds.includes(record.id)}
                        onChange={() => toggleSelect(record.id)}
                      />
                    </td>
                    <td>{record.service_date}</td>
                    <td>
                      {record.patient.last_name} {record.patient.first_name}
                    </td>
                    <td>
                      {record.doctor.last_name} {record.doctor.first_name}
                    </td>
                    <td>
                      {record.amount.toLocaleString(undefined, {
                        style: "currency",
                        currency: "CZK"
                      })}
                    </td>
                    <td>{record.payment_method}</td>
                    <td>{record.note}</td>
                    <td className="hidden-mobile">
                      <button
                        type="button"
                        className="btn-danger btn-icon"
                        disabled={isDeleting(record.id)}
                        onClick={() =>
                          setConfirmState({ type: "single", ids: [record.id] })
                        }
                        aria-label="Delete payment"
                      >
                        <svg
                          className="icon"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fill="currentColor"
                            d="M7 2h6l1 2h4v2H2V4h4l1-2zm1 6h2v8H8V8zm4 0h2v8h-2V8z"
                          />
                        </svg>
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={7}>No records for selected period</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {confirmState && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h2>Confirm deletion</h2>
            </div>
            <div className="modal-body">
              <p>
                {confirmState.type === "bulk"
                  ? `Delete ${confirmState.ids.length} selected payments?`
                  : "Delete this payment?"}
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmState(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => performDelete(confirmState.ids)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
