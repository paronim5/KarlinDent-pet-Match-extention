import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { useApi } from "../api/client.js";
import PeriodSelector from "../components/PeriodSelector.jsx";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

export default function DoctorPage() {
  const { id } = useParams();
  const api = useApi();
  const storedPeriod = localStorage.getItem("globalPeriod") || "month";

  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(storedPeriod);
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [range, setRange] = useState({ from: "", to: "" });
  const [rangeError, setRangeError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [commissionData, setCommissionData] = useState(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionError, setCommissionError] = useState("");
  const [hourlyData, setHourlyData] = useState(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [hourlyError, setHourlyError] = useState("");
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [documentFilter, setDocumentFilter] = useState({ from: "", to: "" });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: "rgba(255, 215, 0, 0.1)" },
        ticks: { color: "#ffd700", font: { family: "VT323", size: 14 } }
      },
      y: {
        grid: { color: "rgba(255, 215, 0, 0.1)" },
        ticks: { color: "#ffd700", font: { family: "VT323", size: 14 } }
      }
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#f5f0dc", font: { family: "Press Start 2P", size: 8 } }
      }
    }
  };

  const computeRange = (selectedPeriod, custom) => {
    if (selectedPeriod === "custom") {
      return { from: custom.from, to: custom.to };
    }
    const now = new Date();
    const toDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let fromDate = new Date(toDate);
    if (selectedPeriod === "day") {
      fromDate = new Date(toDate);
    } else if (selectedPeriod === "week") {
      fromDate = new Date(toDate);
      fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    } else if (selectedPeriod === "month") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    } else if (selectedPeriod === "year") {
      fromDate = new Date(Date.UTC(toDate.getUTCFullYear(), 0, 1));
    }
    const format = (d) => d.toISOString().slice(0, 10);
    return { from: format(fromDate), to: format(toDate) };
  };

  const formatCurrency = (value) =>
    Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "CZK" });

  const loadOverview = async () => {
    setLoading(true);
    setError("");
    try {
      const [ov, monthlyItems] = await Promise.all([
        api.get(`/income/doctor/${id}/overview`),
        api.get(`/income/doctor/${id}/summary/monthly`)
      ]);
      setOverview(ov);
      setMonthly(monthlyItems);
    } catch (err) {
      if (err && err.message === "invalid_doctor") {
        setError("This staff member is not a doctor or is inactive.");
      } else {
        setError(err.message || "Unable to load doctor statistics");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCommissions = async (rangeFrom, rangeTo) => {
    if (!rangeFrom || !rangeTo) return;
    setCommissionLoading(true);
    setCommissionError("");
    try {
      const data = await api.get(
        `/income/doctor/${id}/commissions?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`
      );
      setCommissionData(data);
    } catch (err) {
      setCommissionError(err.message || "Unable to load commission list");
    } finally {
      setCommissionLoading(false);
    }
  };

  const loadHourly = async (dateValue) => {
    if (!dateValue) return;
    setHourlyLoading(true);
    setHourlyError("");
    try {
      const data = await api.get(
        `/income/doctor/${id}/summary/hourly?date=${encodeURIComponent(dateValue)}`
      );
      setHourlyData(data);
    } catch (err) {
      setHourlyError(err.message || "Unable to load hourly stats");
    } finally {
      setHourlyLoading(false);
    }
  };

  const loadDocuments = async (fromValue, toValue) => {
    setDocumentsLoading(true);
    setDocumentsError("");
    try {
      const params = new URLSearchParams();
      params.set("type", "salary_report");
      if (fromValue) params.set("from", fromValue);
      if (toValue) params.set("to", toValue);
      const items = await api.get(`/staff/${id}/documents?${params.toString()}`);
      setDocuments(items);
    } catch (err) {
      setDocumentsError(err.message || "Unable to load salary documents");
    } finally {
      setDocumentsLoading(false);
    }
  };

  const downloadDocument = async (documentId, fallbackName) => {
    try {
      const headers = {};
      const rawUser = localStorage.getItem("auth_user");
      if (rawUser) {
        const user = JSON.parse(rawUser);
        if (user?.id) headers["X-Staff-Id"] = String(user.id);
        if (user?.role) headers["X-Staff-Role"] = String(user.role);
      }
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

  useEffect(() => {
    const initial = computeRange(storedPeriod, customRange);
    setRange(initial);
    setSelectedDate(initial.to || new Date().toISOString().slice(0, 10));
    loadOverview();
  }, [id]);

  useEffect(() => {
    const nextRange = computeRange(period, customRange);
    if (nextRange.from && nextRange.to && nextRange.from > nextRange.to) {
      setRangeError("Invalid date range");
      return;
    }
    if (nextRange.from && nextRange.to) {
      setRangeError("");
      setRange(nextRange);
      if (!selectedDate || period === "day") {
        setSelectedDate(nextRange.to);
      }
    }
  }, [period, customRange]);

  useEffect(() => {
    if (!range.from && !range.to) return;
    setDocumentFilter({ from: range.from, to: range.to });
  }, [range.from, range.to]);

  useEffect(() => {
    if (range.from && range.to) {
      loadCommissions(range.from, range.to);
    }
  }, [id, range.from, range.to]);

  useEffect(() => {
    if (documentFilter.from || documentFilter.to) {
      loadDocuments(documentFilter.from, documentFilter.to);
    }
  }, [id, documentFilter.from, documentFilter.to]);

  useEffect(() => {
    if (selectedDate) {
      loadHourly(selectedDate);
    }
  }, [id, selectedDate]);

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail?.from && event?.detail?.to && event?.detail?.period) {
        setPeriod(event.detail.period);
        setCustomRange({ from: event.detail.from, to: event.detail.to });
        setRange({ from: event.detail.from, to: event.detail.to });
        setSelectedDate(event.detail.to);
      }
    };
    const refresh = () => {
      loadOverview();
      if (range.from && range.to) {
        loadCommissions(range.from, range.to);
      }
      if (selectedDate) {
        loadHourly(selectedDate);
      }
    };
    window.addEventListener("periodChanged", handler);
    window.addEventListener("incomeAdded", refresh);
    return () => {
      window.removeEventListener("periodChanged", handler);
      window.removeEventListener("incomeAdded", refresh);
    };
  }, [range.from, range.to, selectedDate, id]);

  const monthlyChartData = useMemo(() => {
    if (!monthly || monthly.length === 0) return null;
    const labels = monthly.map((m) => m.month);
    return {
      labels,
      datasets: [
        {
          label: "INCOME",
          data: monthly.map((m) => m.total_income),
          backgroundColor: "rgba(0, 212, 255, 0.7)",
          borderColor: "#00d4ff",
          borderWidth: 2
        },
        {
          label: "COMMISSION",
          data: monthly.map((m) => m.total_commission),
          backgroundColor: "rgba(46, 204, 64, 0.7)",
          borderColor: "#2ecc40",
          borderWidth: 2
        }
      ]
    };
  }, [monthly]);

  const hourlyChartData = useMemo(() => {
    if (!hourlyData || !hourlyData.hours || hourlyData.hours.length === 0) return null;
    const labels = hourlyData.hours.map((h) => h.label);
    return {
      labels,
      datasets: [
        {
          label: "COMMISSION",
          data: hourlyData.hours.map((h) => h.total_commission),
          borderColor: "#2ecc40",
          backgroundColor: "rgba(46, 204, 64, 0.2)",
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.2
        }
      ]
    };
  }, [hourlyData]);

  const hourlyChartOptions = useMemo(() => {
    return {
      ...chartOptions,
      plugins: {
        ...chartOptions.plugins,
        tooltip: {
          titleFont: { family: "VT323", size: 14 },
          bodyFont: { family: "VT323", size: 14 },
          callbacks: {
            label: (context) => {
              const value = context.parsed.y || 0;
              const count = hourlyData?.hours?.[context.dataIndex]?.patient_count || 0;
              return `Commission: ${formatCurrency(value)} · Patients: ${count}`;
            }
          }
        }
      }
    };
  }, [hourlyData]);

  const commissionRows = useMemo(() => {
    if (!commissionData?.patients) return [];
    return commissionData.patients.flatMap((patient) =>
      patient.treatments.map((treatment) => ({
        ...treatment,
        patientName: patient.name
      }))
    );
  }, [commissionData]);

  const handlePeriodChange = (value) => {
    setPeriod(value);
  };

  const handleCustomRangeChange = (field, value) => {
    setCustomRange((prev) => ({ ...prev, [field]: value }));
    setPeriod("custom");
  };

  const handleSelectedDateChange = (value) => {
    setSelectedDate(value);
    if (period === "day") {
      setRange({ from: value, to: value });
    }
  };

  const exportCommissionList = () => {
    if (!range.from || !range.to) return;
    window.open(
      `/api/income/doctor/${id}/commissions/export?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      "_blank"
    );
  };

  const exportHourlyStats = () => {
    if (!selectedDate) return;
    window.open(
      `/api/income/doctor/${id}/summary/hourly/export?date=${encodeURIComponent(selectedDate)}`,
      "_blank"
    );
  };

  return (
    <>
      {error && <div className="form-error">SYSTEM ERROR: {error}</div>}
      
      {overview && (
        <>
          <div className="panel" style={{ marginBottom: "20px" }}>
            <div className="panel-header" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="panel-title">Commission Filters</div>
                <div className="panel-meta" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
                  <PeriodSelector value={period} onChange={handlePeriodChange} options={["day", "week", "month", "year"]} />
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="date"
                      value={customRange.from}
                      onChange={(e) => handleCustomRangeChange("from", e.target.value)}
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                    />
                    <span style={{ alignSelf: "center" }}>-</span>
                    <input
                      type="date"
                      value={customRange.to}
                      onChange={(e) => handleCustomRangeChange("to", e.target.value)}
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--subtext)" }}>Selected day</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => handleSelectedDateChange(e.target.value)}
                      className="form-input"
                      style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                    />
                  </div>
                  {rangeError && <span style={{ color: "var(--red)", fontSize: "12px" }}>{rangeError}</span>}
                </div>
              </div>
              <div className="topbar-actions">
                <button className="btn btn-ghost" onClick={exportCommissionList} disabled={!range.from || !range.to}>
                  Export Patients
                </button>
                <button className="btn btn-ghost" onClick={exportHourlyStats} disabled={!selectedDate}>
                  Export Stats
                </button>
              </div>
            </div>
          </div>

          <div className="stat-strip">
            <div className="stat-card s-blue">
              <div className="stat-icon">◉</div>
              <div className="stat-label">Lifetime Patients</div>
              <div className="stat-value">{overview.lifetime.patient_count}</div>
            </div>
            <div className="stat-card s-orange">
              <div className="stat-icon">↗</div>
              <div className="stat-label">Lifetime Income</div>
              <div className="stat-value">
                {overview.lifetime.total_income.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">↗</div>
              <div className="stat-label">Lifetime Commission</div>
              <div className="stat-value">
                {overview.lifetime.total_commission.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">◈</div>
              <div className="stat-label">Avg Commission/Patient</div>
              <div className="stat-value">
                {overview.lifetime.avg_commission_per_patient.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Hourly Commission</div>
                  <div className="panel-meta">{selectedDate || "Select a date"}</div>
                </div>
              </div>
              <div className="chart-area">
                {hourlyLoading && <div>Loading hourly stats...</div>}
                {!hourlyLoading && hourlyError && <div>{hourlyError}</div>}
                {!hourlyLoading && !hourlyError && hourlyChartData && (
                  <Line data={hourlyChartData} options={hourlyChartOptions} />
                )}
                {!hourlyLoading && !hourlyError && !hourlyChartData && (
                  <div>No data for selected date</div>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-title">Monthly Performance</div>
                  <div className="panel-meta">Last 12 months</div>
                </div>
              </div>
              <div className="chart-area">
                {monthlyChartData ? (
                  <Bar data={monthlyChartData} options={chartOptions} />
                ) : (
                  <div>No monthly data</div>
                )}
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: "20px" }}>
            <div className="panel-header">
              <div>
                <div className="panel-title">Patient Commissions</div>
                <div className="panel-meta">
                  {range.from && range.to ? `${range.from} → ${range.to}` : "Select a range"}
                </div>
              </div>
              <div className="topbar-actions">
                {commissionData?.totals && (
                  <div className="mono" style={{ fontSize: "12px", color: "var(--subtext)" }}>
                    {commissionData.totals.patient_count} patients · {commissionData.totals.treatment_count} treatments ·{" "}
                    {formatCurrency(commissionData.totals.total_commission)}
                  </div>
                )}
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Amount</th>
                    <th>Commission</th>
                    <th>Treatment Details</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionLoading && (
                    [...Array(4)].map((_, idx) => (
                      <tr key={`c-${idx}`}>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line" /></td>
                      </tr>
                    ))
                  )}
                  {!commissionLoading && commissionError && (
                    <tr>
                      <td colSpan={6} className="empty-state">{commissionError}</td>
                    </tr>
                  )}
                  {!commissionLoading && !commissionError && commissionRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-state">No commission data for selected range</td>
                    </tr>
                  )}
                  {!commissionLoading && !commissionError && commissionRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.patientName}</td>
                      <td className="mono">{row.service_date}</td>
                      <td className="mono">{row.service_time || "-"}</td>
                      <td className="mono" style={{ color: "var(--green)" }}>
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="mono" style={{ color: "var(--accent)" }}>
                        {formatCurrency(row.commission)}
                      </td>
                      <td>{row.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: "20px" }}>
            <div className="panel-header" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="panel-title">Salary Documents</div>
                <div className="panel-meta">Signed reports</div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={documentFilter.from}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, from: e.target.value }))}
                  className="form-input"
                  style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
                />
                <span style={{ alignSelf: "center" }}>-</span>
                <input
                  type="date"
                  value={documentFilter.to}
                  onChange={(e) => setDocumentFilter((prev) => ({ ...prev, to: e.target.value }))}
                  className="form-input"
                  style={{ padding: "4px 8px", fontSize: "12px", width: "auto" }}
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
                      <td className="mono">{doc.period_from} → {doc.period_to}</td>
                      <td className="mono">{doc.signed_at ? new Date(doc.signed_at).toLocaleString() : "—"}</td>
                      <td>{doc.signer_name}</td>
                      <td className="mono">{doc.file_name || "salary-report.pdf"}</td>
                      <td>
                        <button className="pay-btn" onClick={() => downloadDocument(doc.id, doc.file_name)}>
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
