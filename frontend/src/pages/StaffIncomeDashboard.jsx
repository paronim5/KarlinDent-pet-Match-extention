import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function StaffIncomeDashboard() {
  const api = useApi();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const loadDashboard = async (rangeFrom = from, rangeTo = to) => {
    setLoading(true);
    setError("");
    try {
      const me = await api.get("/auth/me");
      if (me.role === "doctor") {
        setError("Only non-doctor staff can access this page.");
        setLoading(false);
        return;
      }
      const dashboard = await api.get(
        `/outcome/staff/self/dashboard?from=${encodeURIComponent(
          rangeFrom
        )}&to=${encodeURIComponent(rangeTo)}`
      );
      setData(dashboard);
    } catch (err) {
      if (err.status === 401) {
        navigate("/login");
      } else {
        setError(err.message || "Unable to load income data");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleApplyRange = () => {
    if (from && to) {
      loadDashboard(from, to);
    }
  };

  const perDay = data?.hours?.per_day || [];

  const totals = data?.hours || {
    total_hours: 0,
    regular_hours: 0,
    overtime_hours: 0,
  };

  const salary = data?.salary || {
    base_rate: 0,
    overtime_rate: 0,
    base_pay: 0,
    overtime_pay: 0,
    total_pay: 0,
    bonuses: 0,
    deductions: 0,
  };

  const payments = data?.payments || [];

  const incomeChartData = useMemo(() => {
    const labels = perDay.map((d) => d.date);
    const totalsPerDay = perDay.map((d) => {
      const regular = d.regular_hours || 0;
      const overtime = d.overtime_hours || 0;
      return regular * salary.base_rate + overtime * salary.overtime_rate;
    });
    return {
      labels,
      datasets: [
        {
          label: "Total income",
          data: totalsPerDay,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.2)",
          tension: 0.3,
        },
      ],
    };
  }, [perDay, salary.base_rate, salary.overtime_rate]);

  const handleExportCsv = () => {
    if (!data) return;
    const lines = [];
    lines.push("Date,Hours,Regular hours,Overtime hours,Total income");
    perDay.forEach((d) => {
      const regular = d.regular_hours || 0;
      const overtime = d.overtime_hours || 0;
      const totalIncome = regular * salary.base_rate + overtime * salary.overtime_rate;
      lines.push(
        [
          d.date,
          d.hours.toFixed(2),
          regular.toFixed(2),
          overtime.toFixed(2),
          totalIncome.toFixed(2),
        ].join(",")
      );
    });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `income-${from}-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="page page-income-dashboard">
      <div className="card-header">
        <h1>My income</h1>
      </div>
      {error && <div className="form-error">{error}</div>}
      <section className="card">
        <div className="date-range">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" onClick={handleApplyRange} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </button>
          <button type="button" onClick={handleExportCsv} disabled={!data}>
            Export Excel (CSV)
          </button>
          <button type="button" onClick={handlePrintPdf} disabled={!data}>
            Export PDF
          </button>
        </div>
      </section>
      {data && (
        <>
          <section className="grid grid-3">
            <div className="card">
              <h2>Employment</h2>
              <div className="metric">
                <div className="metric-label">Start date</div>
                <div className="metric-value">
                  {data.staff.employment_start_date}
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">Role</div>
                <div className="metric-value">{data.staff.role}</div>
              </div>
            </div>
            <div className="card">
              <h2>Hours</h2>
              <div className="metric">
                <div className="metric-label">Total hours</div>
                <div className="metric-value">{totals.total_hours.toFixed(2)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Regular</div>
                <div className="metric-value">{totals.regular_hours.toFixed(2)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Overtime</div>
                <div className="metric-value">{totals.overtime_hours.toFixed(2)}</div>
              </div>
            </div>
            <div className="card">
              <h2>Salary</h2>
              <div className="metric">
                <div className="metric-label">Base pay</div>
                <div className="metric-value">
                  {salary.base_pay.toFixed(2)} CZK
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">Overtime pay</div>
                <div className="metric-value">
                  {salary.overtime_pay.toFixed(2)} CZK
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">Total</div>
                <div className="metric-value">
                  {salary.total_pay.toFixed(2)} CZK
                </div>
              </div>
            </div>
          </section>
          <section className="grid grid-2">
            <div className="card">
              <h2>Income trend</h2>
              {perDay.length === 0 ? (
                <p>No hours for selected period.</p>
              ) : (
                <Line
                  data={incomeChartData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: true },
                    },
                    scales: {
                      x: { ticks: { maxRotation: 0, minRotation: 0 } },
                      y: { beginAtZero: true },
                    },
                  }}
                />
              )}
            </div>
            <div className="card">
              <h2>Payment history</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.payment_date}</td>
                        <td>{p.amount.toFixed(2)} CZK</td>
                        <td>{p.note || ""}</td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={3}>No salary payments in this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

