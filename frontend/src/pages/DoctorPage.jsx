import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from "chart.js";
import { Line, Bar } from "react-chartjs-2";
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

export default function DoctorPage() {
  const { id } = useParams();
  const api = useApi();

  const today = new Date().toISOString().slice(0, 10);
  const to30 = today;
  const from30 = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [from, setFrom] = useState(from30);
  const [to, setTo] = useState(to30);
  const [loading, setLoading] = useState(false);

  const loadAll = async (rangeFrom = from, rangeTo = to) => {
    setLoading(true);
    setError("");
    try {
      const [ov, dailyItems, monthlyItems] = await Promise.all([
        api.get(`/income/doctor/${id}/overview`),
        api.get(`/income/doctor/${id}/summary/daily?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`),
        api.get(`/income/doctor/${id}/summary/monthly`)
      ]);
      setOverview(ov);
      setDaily(dailyItems);
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

  useEffect(() => {
    loadAll();
  }, [id]);

  const handleRangeChange = ({ from: newFrom, to: newTo }) => {
    setFrom(newFrom);
    setTo(newTo);
    if (newFrom && newTo) {
      loadAll(newFrom, newTo);
    }
  };

  const dailyChartData = useMemo(() => {
    if (!daily || daily.length === 0) return null;
    const labels = daily.map((d) => d.day);
    return {
      labels,
      datasets: [
        {
          label: "Income",
          data: daily.map((d) => d.total_income),
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.3)",
          tension: 0.2
        },
        {
          label: "Commission",
          data: daily.map((d) => d.total_commission),
          borderColor: "rgba(75, 192, 192, 1)",
          backgroundColor: "rgba(75, 192, 192, 0.3)",
          tension: 0.2
        }
      ]
    };
  }, [daily]);

  const monthlyChartData = useMemo(() => {
    if (!monthly || monthly.length === 0) return null;
    const labels = monthly.map((m) => m.month);
    return {
      labels,
      datasets: [
        {
          label: "Income",
          data: monthly.map((m) => m.total_income),
          backgroundColor: "rgba(54, 162, 235, 0.7)"
        },
        {
          label: "Commission",
          data: monthly.map((m) => m.total_commission),
          backgroundColor: "rgba(75, 192, 192, 0.7)"
        }
      ]
    };
  }, [monthly]);

  return (
    <div className="page page-doctor">
      <div className="card-header">
        <h1>
          Doctor statistics
        </h1>
        <div>
          <Link to="/staff">← Back to Staff</Link>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {overview ? (
        <section className="grid grid-3">
          <div className="card">
            <h2>
              {overview.doctor.last_name} {overview.doctor.first_name}
            </h2>
            <div>Commission rate: {(overview.commission_rate * 100).toFixed(1)} %</div>
          </div>
          <div className="card">
            <h3>Today</h3>
            <div className="metric">
              <div className="metric-label">Income</div>
              <div className="metric-value">
                {overview.today.total_income.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Commission</div>
              <div className="metric-value">
                {overview.today.total_commission.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Visits</div>
              <div className="metric-value">{overview.today.visit_count}</div>
            </div>
          </div>
          <div className="card">
            <h3>Lifetime</h3>
            <div className="metric">
              <div className="metric-label">Income</div>
              <div className="metric-value">
                {overview.lifetime.total_income.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Commission</div>
              <div className="metric-value">
                {overview.lifetime.total_commission.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Patients</div>
              <div className="metric-value">{overview.lifetime.patient_count}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Avg commission per patient</div>
              <div className="metric-value">
                {overview.lifetime.avg_commission_per_patient.toLocaleString(undefined, { style: "currency", currency: "CZK" })}
              </div>
            </div>
          </div>
        </section>
      ) : !error ? (
        <div>Loading...</div>
      ) : null}
      <section className="card">
        <div className="card-header">
          <h2>Daily income & commission</h2>
          <DateRangePicker from={from} to={to} onChange={handleRangeChange} />
        </div>
        {loading ? (
          <div>Loading...</div>
        ) : dailyChartData ? (
          <Line
            data={dailyChartData}
            options={{
              responsive: true,
              plugins: { legend: { position: "bottom" } }
            }}
          />
        ) : (
          <div>No data for selected range</div>
        )}
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Monthly income & commission</h2>
        </div>
        {monthlyChartData ? (
          <Bar
            data={monthlyChartData}
            options={{
              responsive: true,
              plugins: { legend: { position: "bottom" } }
            }}
          />
        ) : (
          <div>No monthly data</div>
        )}
      </section>
    </div>
  );
}
