import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { useApi } from "../api/client.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function ClinicPage() {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await api.get("/clinic/dashboard");
        setDashboard(data);
      } catch (err) {
        setError(err.message || "Unable to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleExportCsv = () => {
    window.open("/api/clinic/daily-pnl/export/csv", "_blank", "noopener");
  };

  const handleExportPdf = () => {
    window.open("/api/clinic/daily-pnl/export/pdf", "_blank", "noopener");
  };

  const chartData =
    dashboard &&
    (() => {
      const labels = dashboard.daily_pnl.map((item) => item.day);
      return {
        labels,
        datasets: [
          {
            label: "Income",
            borderColor: "#16a34a",
            backgroundColor: "rgba(22, 163, 74, 0.2)",
            data: dashboard.daily_pnl.map((item) => item.total_income)
          },
          {
            label: "Outcome",
            borderColor: "#dc2626",
            backgroundColor: "rgba(220, 38, 38, 0.2)",
            data: dashboard.daily_pnl.map((item) => item.total_outcome)
          },
          {
            label: "P&L",
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.2)",
            data: dashboard.daily_pnl.map((item) => item.pnl)
          }
        ]
      };
    })();

  return (
    <div className="page page-clinic">
      <h1>Clinic overview</h1>
      {loading && <div>Loading...</div>}
      {error && <div className="form-error">{error}</div>}
      {dashboard && (
        <>
          <section className="grid grid-3">
            <div className="metric">
              <div className="metric-label">Monthly lease cost</div>
              <div className="metric-value">
                {dashboard.lease_cost.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Average payment per patient</div>
              <div className="metric-value">
                {dashboard.avg_payment_per_patient.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Average salary by role</div>
              <ul className="metric-list">
                {Object.entries(dashboard.avg_salary_by_role).map(([role, value]) => (
                  <li key={role}>
                    <span>{role}</span>
                    <span>
                      {value.toLocaleString(undefined, {
                        style: "currency",
                        currency: "CZK"
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <h2>Daily P&amp;L</h2>
              <div className="button-row">
                <button type="button" onClick={handleExportCsv}>
                  Export CSV
                </button>
                <button type="button" onClick={handleExportPdf}>
                  Export PDF
                </button>
              </div>
            </div>
            {chartData && (
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: "bottom"
                    }
                  }
                }}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
