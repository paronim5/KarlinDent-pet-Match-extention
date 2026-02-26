import { useEffect, useMemo, useState } from "react";
import { useApi } from "../api/client.js";

export default function OutcomePage() {
  const api = useApi();
  const today = new Date().toISOString().slice(0, 10);

  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [records, setRecords] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [error, setError] = useState("");

  const [expenseForm, setExpenseForm] = useState({
    categoryId: "",
    amount: "",
    expenseDate: today,
    vendor: "",
    description: ""
  });

  const [salaryForm, setSalaryForm] = useState({
    staffId: "",
    amount: "",
    paymentDate: today,
    note: ""
  });

  const [savingExpense, setSavingExpense] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState([]);
  const [selectedSalaryIds, setSelectedSalaryIds] = useState([]);
  const [deletingOutcomeIds, setDeletingOutcomeIds] = useState([]);
  const [deletingSalaryIds, setDeletingSalaryIds] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const loadReferenceData = async () => {
    try {
      const [cats, staffItems] = await Promise.all([
        api.get("/outcome/categories"),
        api.get("/staff")
      ]);
      setCategories(cats);
      setStaff(staffItems);
    } catch (err) {
      setError(err.message || "Unable to load reference data");
    }
  };

  const loadPeriodData = async (rangeFrom = from, rangeTo = to) => {
    try {
      const [outcomeRecords, salaryRows] = await Promise.all([
        api.get(`/outcome/records?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(
          rangeTo
        )}`),
        api.get(
          `/outcome/salaries?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(
            rangeTo
          )}`
        )
      ]);
      setRecords(outcomeRecords);
      setSalaries(salaryRows);
      setSelectedOutcomeIds([]);
      setSelectedSalaryIds([]);
    } catch (err) {
      setError(err.message || "Unable to load outcome data");
    }
  };

  useEffect(() => {
    loadReferenceData();
    loadPeriodData();
  }, []);

  const handlePeriodChange = () => {
    if (from && to) {
      loadPeriodData(from, to);
      if (salaryForm.staffId) {
        handleSuggestAmount(salaryForm.staffId, from, to);
      }
    }
  };

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();
    setSavingExpense(true);
    setError("");

    try {
      await api.post("/outcome/records", {
        category_id: expenseForm.categoryId ? Number(expenseForm.categoryId) : null,
        amount: Number(expenseForm.amount),
        expense_date: expenseForm.expenseDate,
        vendor: expenseForm.vendor || undefined,
        description: expenseForm.description || undefined
      });
      setExpenseForm({
        categoryId: "",
        amount: "",
        expenseDate: today,
        vendor: "",
        description: ""
      });
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to save expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleSalarySubmit = async (event) => {
    event.preventDefault();
    setSavingSalary(true);
    setError("");

    try {
      await api.post("/outcome/salaries", {
        staff_id: salaryForm.staffId ? Number(salaryForm.staffId) : null,
        amount: Number(salaryForm.amount),
        payment_date: salaryForm.paymentDate,
        note: salaryForm.note || undefined
      });
      setSalaryForm({
        staffId: "",
        amount: "",
        paymentDate: today,
        note: ""
      });
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to save salary payment");
    } finally {
      setSavingSalary(false);
    }
  };

  const handleSuggestAmount = async (staffId, rangeFrom, rangeTo) => {
    try {
      const suggestion = await api.get(
        `/outcome/salary/suggested?staff_id=${staffId}&from=${encodeURIComponent(
          rangeFrom
        )}&to=${encodeURIComponent(rangeTo)}`
      );
      if (suggestion && typeof suggestion.suggested_amount === "number") {
        setSalaryForm((prev) => ({ ...prev, amount: suggestion.suggested_amount.toFixed(2) }));
      }
    } catch (err) {
      // ignore, user can enter manually
    }
  };

  const totalOutcome = useMemo(
    () =>
      records.reduce((sum, item) => sum + item.amount, 0) +
      salaries.reduce((sum, item) => sum + item.amount, 0),
    [records, salaries]
  );

  const toggleSelectOutcome = (id) => {
    setSelectedOutcomeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectSalary = (id) => {
    setSelectedSalaryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllOutcome = () => {
    if (selectedOutcomeIds.length === records.length) {
      setSelectedOutcomeIds([]);
    } else {
      setSelectedOutcomeIds(records.map((r) => r.id));
    }
  };

  const selectAllSalary = () => {
    if (selectedSalaryIds.length === salaries.length) {
      setSelectedSalaryIds([]);
    } else {
      setSelectedSalaryIds(salaries.map((r) => r.id));
    }
  };

  const isDeletingOutcome = (id) => deletingOutcomeIds.includes(id);
  const isDeletingSalary = (id) => deletingSalaryIds.includes(id);

  const performDeleteOutcome = async (ids) => {
    setDeletingOutcomeIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/outcome/records/${id}`);
      }
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to delete outcome records");
    } finally {
      setDeletingOutcomeIds([]);
      setConfirmState(null);
    }
  };

  const performDeleteSalary = async (ids) => {
    setDeletingSalaryIds((prev) => [...prev, ...ids]);
    setError("");
    try {
      for (const id of ids) {
        await api.delete(`/outcome/salaries/${id}`);
      }
      await loadPeriodData();
    } catch (err) {
      setError(err.message || "Unable to delete salary payments");
    } finally {
      setDeletingSalaryIds([]);
      setConfirmState(null);
    }
  };

  return (
    <div className="page page-outcome">
      <h1>Outcome</h1>
      {error && <div className="form-error">{error}</div>}
      <section className="grid grid-2">
        <form className="card" onSubmit={handleExpenseSubmit}>
          <h2>Record expense</h2>
          <label>
            Category
            <select
              required
              value={expenseForm.categoryId}
              onChange={(event) =>
                setExpenseForm((prev) => ({ ...prev, categoryId: event.target.value }))
              }
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
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
              value={expenseForm.amount}
              onChange={(event) =>
                setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))
              }
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={expenseForm.expenseDate}
              onChange={(event) =>
                setExpenseForm((prev) => ({ ...prev, expenseDate: event.target.value }))
              }
            />
          </label>
          <label>
            Vendor
            <input
              value={expenseForm.vendor}
              onChange={(event) =>
                setExpenseForm((prev) => ({ ...prev, vendor: event.target.value }))
              }
            />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={expenseForm.description}
              onChange={(event) =>
                setExpenseForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>
          <button type="submit" disabled={savingExpense}>
            {savingExpense ? "Saving..." : "Save expense"}
          </button>
        </form>
        <form className="card" onSubmit={handleSalarySubmit}>
          <h2>Record salary payment</h2>
          <label>
            Staff member
            <select
              required
              value={salaryForm.staffId}
              onChange={(event) =>
                {
                  const v = event.target.value;
                  setSalaryForm((prev) => ({ ...prev, staffId: v }));
                  if (v) {
                    handleSuggestAmount(v, from, to);
                  }
                }
              }
            >
              <option value="">Select staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.role}: {s.last_name} {s.first_name}
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
              value={salaryForm.amount}
              onChange={(event) =>
                setSalaryForm((prev) => ({ ...prev, amount: event.target.value }))
              }
            />
          </label>
          <label>
            Payment date
            <input
              type="date"
              value={salaryForm.paymentDate}
              onChange={(event) =>
                setSalaryForm((prev) => ({ ...prev, paymentDate: event.target.value }))
              }
            />
          </label>
          <label>
            Note
            <textarea
              rows={3}
              value={salaryForm.note}
              onChange={(event) =>
                setSalaryForm((prev) => ({ ...prev, note: event.target.value }))
              }
            />
          </label>
          <button type="submit" disabled={savingSalary}>
            {savingSalary ? "Saving..." : "Save salary payment"}
          </button>
        </form>
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Outcome records</h2>
          <div className="date-range">
            <label>
              From
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <button type="button" onClick={handlePeriodChange}>
              Apply
            </button>
            <button
              type="button"
              className="btn-secondary hidden-mobile"
              disabled={selectedOutcomeIds.length === 0}
              onClick={() =>
                setConfirmState({
                  type: "outcome-bulk",
                  ids: selectedOutcomeIds.slice()
                })
              }
            >
              Delete selected expenses
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all expenses"
                    checked={
                      records.length > 0 &&
                      selectedOutcomeIds.length === records.length
                    }
                    onChange={selectAllOutcome}
                  />
                </th>
                <th>Date</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {records.map((item) => (
                <tr
                  key={`o-${item.id}`}
                  className={
                    selectedOutcomeIds.includes(item.id)
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
                      setConfirmState({
                        type: "outcome-single",
                        ids: [item.id]
                      });
                    }
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label="Select expense"
                      checked={selectedOutcomeIds.includes(item.id)}
                      onChange={() => toggleSelectOutcome(item.id)}
                    />
                  </td>
                  <td>{item.expense_date}</td>
                  <td>{item.category}</td>
                  <td>{item.vendor}</td>
                  <td>{item.description}</td>
                  <td>
                    {item.amount.toLocaleString(undefined, {
                      style: "currency",
                      currency: "CZK"
                    })}
                  </td>
                  <td className="hidden-mobile">
                    <button
                      type="button"
                      className="btn-danger btn-icon"
                      disabled={isDeletingOutcome(item.id)}
                      onClick={() =>
                        setConfirmState({
                          type: "outcome-single",
                          ids: [item.id]
                        })
                      }
                      aria-label="Delete expense"
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
                  <td colSpan={6}>No expenses for selected period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <h3>Salary payments</h3>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all salary payments"
                    checked={
                      salaries.length > 0 &&
                      selectedSalaryIds.length === salaries.length
                    }
                    onChange={selectAllSalary}
                  />
                </th>
                <th>Date</th>
                <th>Staff</th>
                <th>Amount</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {salaries.map((item) => (
                <tr
                  key={`s-${item.id}`}
                  className={
                    selectedSalaryIds.includes(item.id)
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
                      setConfirmState({
                        type: "salary-single",
                        ids: [item.id]
                      });
                    }
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label="Select salary payment"
                      checked={selectedSalaryIds.includes(item.id)}
                      onChange={() => toggleSelectSalary(item.id)}
                    />
                  </td>
                  <td>{item.payment_date}</td>
                  <td>
                    {item.staff.last_name} {item.staff.first_name}
                  </td>
                  <td>
                    {item.amount.toLocaleString(undefined, {
                      style: "currency",
                      currency: "CZK"
                    })}
                  </td>
                  <td>{item.note}</td>
                  <td className="hidden-mobile">
                    <button
                      type="button"
                      className="btn-danger btn-icon"
                      disabled={isDeletingSalary(item.id)}
                      onClick={() =>
                        setConfirmState({
                          type: "salary-single",
                          ids: [item.id]
                        })
                      }
                      aria-label="Delete salary payment"
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
              {salaries.length === 0 && (
                <tr>
                  <td colSpan={5}>No salary payments for selected period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {confirmState && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h2>Confirm deletion</h2>
            </div>
            <div className="modal-body">
              <p>
                {confirmState.type === "outcome-bulk"
                  ? `Delete ${confirmState.ids.length} selected expenses?`
                  : confirmState.type === "salary-bulk"
                  ? `Delete ${confirmState.ids.length} selected salary payments?`
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
                  onClick={() => {
                    if (
                      confirmState.type === "outcome-single" ||
                      confirmState.type === "outcome-bulk"
                    ) {
                      performDeleteOutcome(confirmState.ids);
                    } else {
                      performDeleteSalary(confirmState.ids);
                    }
                  }}
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
