import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../api/client.js";

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  bio: "",
  role: "doctor",
  baseSalary: "",
  commissionRate: ""
};

export default function StaffPage() {
  const api = useApi();

  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState(null);
  const [lastRemoved, setLastRemoved] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadRoles = async () => {
    try {
      const items = await api.get("/staff/roles");
      setRoles(items);
    } catch {
      setRoles([]);
    }
  };

  const loadStaff = async (role = roleFilter, query = search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (role) params.append("role", role);
      if (query) params.append("q", query);
      const items = await api.get(`/staff?${params.toString()}`);
      setStaff(items);
    } catch (err) {
      setError(err.message || "Unable to load staff directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
    loadStaff();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api.post("/staff", {
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || undefined,
        email: form.email || undefined,
        bio: form.bio || undefined,
        role: form.role,
        base_salary: form.role === "doctor" ? 0 : form.baseSalary ? Number(form.baseSalary) : 0,
        commission_rate:
          form.role === "doctor" && form.commissionRate
            ? Number(form.commissionRate) / 100
            : 0
      });
      setForm(emptyForm);
      setShowForm(false);
      await loadStaff();
    } catch (err) {
      setError(err.message || "Unable to add staff member");
    } finally {
      setSaving(false);
    }
  };

  const filteredStaff = useMemo(() => staff, [staff]);

  const handleEditCommission = async (member) => {
    if (member.role !== "doctor") {
      return;
    }
    const currentPercent = (member.commission_rate * 100).toFixed(1);
    const input = window.prompt(
      `Set commission rate (%) for ${member.first_name} ${member.last_name}`,
      currentPercent
    );
    if (input === null) {
      return;
    }
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      window.alert("Please enter a valid percentage between 0 and 100.");
      return;
    }
    setError("");
    try {
      await api.post(`/staff/${member.id}/commission`, {
        commission_rate: value / 100
      });
      await loadStaff();
    } catch (err) {
      setError(err.message || "Unable to update commission rate");
    }
  };

  const handleSetPassword = async (member) => {
    const password = window.prompt(`Set new password for ${member.first_name} ${member.last_name}`);
    if (!password) {
      return;
    }
    try {
      await api.post(`/staff/${member.id}/password`, { password });
    } catch (err) {
      setError(err.message || "Unable to set password");
    }
  };

  const handleRemove = async (member) => {
    const confirmed = window.confirm(
      `Remove ${member.first_name} ${member.last_name} from staff? They will no longer appear in lists.`
    );
    if (!confirmed) {
      return;
    }
    setRemovingId(member.id);
    setError("");
    try {
      await api.delete(`/staff/${member.id}`);
      setStaff((prev) => prev.filter((item) => item.id !== member.id));
      setLastRemoved(member);
    } catch (err) {
      setError(err.message || "Unable to remove staff member");
    } finally {
      setRemovingId(null);
    }
  };

  const handleUndoRemove = async () => {
    if (!lastRemoved) {
      return;
    }
    setError("");
    try {
      await api.post(`/staff/${lastRemoved.id}/restore`, {});
      await loadStaff();
      setLastRemoved(null);
    } catch (err) {
      setError(err.message || "Unable to restore staff member");
    }
  };

  return (
    <div className="page page-staff">
      <h1>Staff</h1>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {lastRemoved && (
        <div className="flash" role="status" aria-live="polite">
          <span>
            Removed {lastRemoved.first_name} {lastRemoved.last_name}.
          </span>
          <button type="button" onClick={handleUndoRemove}>
            Undo
          </button>
        </div>
      )}
      <section className="card">
        <div className="card-header">
          <div className="filters">
            <label>
              Role
              <select
                value={roleFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  setRoleFilter(value);
                  loadStaff(value, search);
                }}
              >
                <option value="">All</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Search
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearch(value);
                  loadStaff(roleFilter, value);
                }}
                placeholder="Name or email"
              />
            </label>
          </div>
          <button type="button" onClick={() => setShowForm(true)}>
            Add personnel
          </button>
        </div>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Base / hourly</th>
                  <th>Commission %</th>
                  <th>Last payment</th>
                  <th>Total profit</th>
                  <th>Commission earned</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td>{member.role}</td>
                    <td>
                      {member.role === "doctor" ? (
                        <Link to={`/staff/doctor/${member.id}`}>
                          {member.last_name} {member.first_name}
                        </Link>
                      ) : member.role === "administrator" ? (
                        <Link to={`/staff/administrator/${member.id}`}>
                          {member.last_name} {member.first_name}
                        </Link>
                      ) : member.role === "assistant" ? (
                        <Link to={`/staff/assistant/${member.id}`}>
                          {member.last_name} {member.first_name}
                        </Link>
                      ) : (
                        <>
                          {member.last_name} {member.first_name}
                        </>
                      )}
                    </td>
                    <td>{member.phone}</td>
                    <td>{member.email}</td>
                    <td>
                      {member.role === "doctor"
                        ? "-"
                        : member.base_salary.toLocaleString(undefined, {
                            style: "currency",
                            currency: "CZK"
                          })}
                    </td>
                    <td>
                      {member.role === "doctor"
                        ? `${(member.commission_rate * 100).toFixed(1)} %`
                        : "-"}
                    </td>
                    <td>{member.last_paid_at || "-"}</td>
                    <td>
                      {member.role === "doctor"
                        ? member.total_revenue.toLocaleString(undefined, {
                            style: "currency",
                            currency: "CZK"
                          })
                        : "-"}
                    </td>
                    <td>
                      {member.role === "doctor"
                        ? member.commission_income.toLocaleString(undefined, {
                            style: "currency",
                            currency: "CZK"
                          })
                        : "-"}
                    </td>
                    <td>{member.is_active ? "Yes" : "No"}</td>
                    <td>
                      <div className="button-row">
                        {member.role === "doctor" && (
                          <button type="button" onClick={() => handleEditCommission(member)}>
                            Edit commission
                          </button>
                        )}
                        {member.role === "administrator" && (
                          <button type="button" onClick={() => handleSetPassword(member)}>
                            Set password
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemove(member)}
                          disabled={removingId === member.id}
                        >
                          {removingId === member.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={9}>No staff members</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showForm && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Add staff member</h2>
              <button type="button" onClick={() => setShowForm(false)}>
                ×
              </button>
            </div>
            <form className="modal-body" onSubmit={handleSubmit}>
              <label>
                First name
                <input
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
              </label>
              <label>
                Last name
                <input
                  required
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                />
              </label>
              <label>
                Role
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, role: event.target.value }))
                  }
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {form.role === "doctor" ? "Commission rate (%)" : "Base / hourly salary"}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.role === "doctor" ? form.commissionRate : form.baseSalary}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev.role === "doctor"
                        ? { ...prev, commissionRate: event.target.value }
                        : { ...prev, baseSalary: event.target.value }
                    )
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label>
                Bio
                <textarea
                  rows={3}
                  value={form.bio}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, bio: event.target.value }))
                  }
                />
              </label>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
