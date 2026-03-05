import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        setError(err.message || t("clinic.errors.load_dashboard"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [t]);

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
            label: t("clinic.chart.income"),
            borderColor: "#2ecc40",
            backgroundColor: "rgba(46, 204, 64, 0.1)",
            borderWidth: 4,
            pointRadius: 6,
            pointBackgroundColor: "#2ecc40",
            data: dashboard.daily_pnl.map((item) => item.total_income)
          },
          {
            label: t("clinic.chart.outcome"),
            borderColor: "#e03030",
            backgroundColor: "rgba(224, 48, 48, 0.1)",
            borderWidth: 4,
            pointRadius: 6,
            pointBackgroundColor: "#e03030",
            data: dashboard.daily_pnl.map((item) => item.total_outcome)
          },
          {
            label: t("clinic.chart.profit"),
            borderColor: "#ffd700",
            backgroundColor: "rgba(255, 215, 0, 0.1)",
            borderWidth: 4,
            pointRadius: 6,
            pointBackgroundColor: "#ffd700",
            data: dashboard.daily_pnl.map((item) => item.pnl)
          }
        ]
      };
    })();

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

  return (
    <>
      {loading && <div>{t("common.loading")}</div>}
      {error && <div className="form-error">{error}</div>}
      {dashboard && (
        <>
          <div className="stat-strip">
            <div className="stat-card s-orange">
              <div className="stat-icon">↗</div>
              <div className="stat-label">{t("clinic.total_income")}</div>
              <div className="stat-value">
                {dashboard.lease_cost.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="stat-card s-red">
              <div className="stat-icon">↙</div>
              <div className="stat-label">{t("clinic.payroll_due")}</div>
              <div className="stat-value">
                {dashboard.avg_payment_per_patient.toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="stat-card s-green">
              <div className="stat-icon">◈</div>
              <div className="stat-label">{t("clinic.net_profit")}</div>
              <div className="stat-value">
                {Object.values(dashboard.avg_salary_by_role).reduce((a, b) => a + b, 0).toLocaleString(undefined, {
                  style: "currency",
                  currency: "CZK"
                })}
              </div>
            </div>
            <div className="stat-card s-blue">
              <div className="stat-icon">◉</div>
              <div className="stat-label">{t("clinic.active_staff")}</div>
              <div className="stat-value">{Object.keys(dashboard.avg_salary_by_role).length}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">{t("clinic.daily_pnl")}</div>
                <div className="panel-meta">{t("clinic.last_30_days")}</div>
              </div>
              <div className="topbar-actions">
                <button className="btn btn-ghost" onClick={handleExportCsv}>⇣ {t("common.export_csv")}</button>
                <button className="btn btn-ghost" onClick={handleExportPdf}>⇣ {t("common.export_pdf")}</button>
              </div>
            </div>
            <div className="chart-area">
              {chartData && (
                <Line data={chartData} options={chartOptions} />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
