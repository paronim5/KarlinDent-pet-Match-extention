import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import React from "react";
import AddOutcomePage from "./AddOutcomePage.jsx";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key
  })
}));

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({
    get: getMock,
    post: postMock
  })
}));

vi.mock("../App.jsx", () => ({
  useAuth: () => ({
    user: { id: 5, first_name: "Pasha", last_name: "Kosov", role: "assistant" }
  })
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

const staffItems = [
  { id: 5, first_name: "Pasha", last_name: "Kosov", role: "assistant", base_salary: 200 }
];

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  window.history.pushState({}, "", "/outcome/add");
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    lineWidth: 0,
    lineCap: "",
    strokeStyle: "",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn()
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("prefills salary amount from timesheet calculation for non-doctor", async () => {
  window.history.pushState(
    {},
    "",
    "/outcome/add?tab=salary&staff_id=5&amount=2200&from=2026-03-01&to=2026-03-08"
  );
  getMock.mockImplementation((path) => {
    if (path === "/outcome/categories") return Promise.resolve([]);
    if (path === "/staff") return Promise.resolve(staffItems);
    if (path.startsWith("/staff/5/salary-estimate")) {
      return Promise.resolve({ estimated_total: 200, base_salary: 200, commission_rate: 0, total_revenue: 0, commission_part: 0 });
    }
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([{ hours: 3 }, { hours: 8 }]);
    }
    return Promise.resolve([]);
  });

  const { container } = render(<AddOutcomePage />);

  await waitFor(() => expect(screen.getByDisplayValue("2200.00")).toBeTruthy());
  expect(screen.getByText("11.00")).toBeTruthy();
});

test("shows empty amount when no hours in range", async () => {
  window.history.pushState(
    {},
    "",
    "/outcome/add?tab=salary&staff_id=5&from=2026-03-01&to=2026-03-08"
  );
  getMock.mockImplementation((path) => {
    if (path === "/outcome/categories") return Promise.resolve([]);
    if (path === "/staff") return Promise.resolve(staffItems);
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([]);
    }
    if (path.startsWith("/staff/5/salary-estimate")) {
      return Promise.resolve({ estimated_total: 200, base_salary: 200, commission_rate: 0, total_revenue: 0, commission_part: 0 });
    }
    return Promise.resolve([]);
  });

  render(<AddOutcomePage />);

  await waitFor(() => expect(screen.getByText("No hours recorded for selected period.")).toBeTruthy());
  expect(screen.queryByDisplayValue("0.00")).toBeNull();
});

test("auto-populates signer name for salary report signing", async () => {
  window.history.pushState(
    {},
    "",
    "/outcome/add?tab=salary&staff_id=5&from=2026-03-01&to=2026-03-08"
  );
  getMock.mockImplementation((path) => {
    if (path === "/outcome/categories") return Promise.resolve([]);
    if (path === "/staff") return Promise.resolve(staffItems);
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([{ hours: 8 }]);
    }
    if (path.startsWith("/staff/5/salary-estimate")) {
      return Promise.resolve({ estimated_total: 200, base_salary: 200, commission_rate: 0, total_revenue: 0, commission_part: 0 });
    }
    return Promise.resolve([]);
  });

  render(<AddOutcomePage />);

  await waitFor(() => expect(screen.getByText("Salary Breakdown")).toBeTruthy());
  const submitBtn = screen.getByText("outcome.form.submit_salary");
  await submitBtn.click();
  await waitFor(() => expect(screen.getByText("Salary Report Signature")).toBeTruthy());
});

test("syncs doctor amount input with adjusted database salary and unpaid patients", async () => {
  window.history.pushState(
    {},
    "",
    "/outcome/add?tab=salary&staff_id=8&from=2026-03-01&to=2026-03-31"
  );
  getMock.mockImplementation((path) => {
    if (path === "/outcome/categories") return Promise.resolve([]);
    if (path === "/staff") {
      return Promise.resolve([
        { id: 8, first_name: "Viktoriia", last_name: "O", role: "doctor", commission_rate: 0.3, base_salary: 0 }
      ]);
    }
    if (path.startsWith("/staff/8/salary-estimate")) {
      return Promise.resolve({
        role: "doctor",
        base_salary: 0,
        commission_rate: 0.3,
        total_income: 4567,
        total_lab_fees: 150,
        commission_part: 1370.1,
        adjustments: 0,
        adjusted_total: 1220.1,
        unpaid_patients: [{ name: "Alice Novak", net_paid: 4417 }]
      });
    }
    return Promise.resolve([]);
  });

  render(<AddOutcomePage />);

  await waitFor(() => expect(screen.getByDisplayValue("1220.10")).toBeTruthy());
  expect(screen.getByText("Unpaid Patients (1)")).toBeTruthy();
  expect(screen.getByText("Alice Novak")).toBeTruthy();
});

test("opens signature modal when Record Salary is clicked and submits with signature", async () => {
  window.history.pushState(
    {},
    "",
    "/outcome/add?tab=salary&staff_id=5&amount=1000&from=2026-03-01&to=2026-03-08"
  );
  getMock.mockImplementation((path) => {
    if (path === "/outcome/categories") return Promise.resolve([]);
    if (path === "/staff") return Promise.resolve(staffItems);
    if (path.startsWith("/staff/5/salary-estimate")) {
      return Promise.resolve({ estimated_total: 1000, base_salary: 200, commission_rate: 0, total_revenue: 0, commission_part: 0 });
    }
    if (path.startsWith("/outcome/timesheets")) {
      return Promise.resolve([{ hours: 5 }]);
    }
    return Promise.resolve([]);
  });

  const { container } = render(<AddOutcomePage />);

  await waitFor(() => expect(screen.getByDisplayValue("1000.00")).toBeTruthy());

  const submitBtn = screen.getByText("outcome.form.submit_salary");
  await submitBtn.click();

  // Signature modal should be open
  await waitFor(() => expect(screen.getByText("Salary Report Signature")).toBeTruthy());

  // Simulate signature
  const canvas = container.querySelector("canvas");
  canvas.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    width: 320,
    height: 140
  }));
  fireEvent.mouseDown(canvas);
  fireEvent.mouseMove(canvas, { clientX: 10, clientY: 10 });
  fireEvent.mouseUp(canvas);

  const recordAndSignBtn = screen.getByText("Record Salary & Sign");
  await waitFor(() => expect(recordAndSignBtn.disabled).toBe(false));
  await recordAndSignBtn.click();

  await waitFor(() => expect(postMock).toHaveBeenCalledWith("/staff/salaries", expect.objectContaining({
    staff_id: 5,
    amount: 1000,
    signature: expect.objectContaining({
      signer_name: "Pasha Kosov"
    })
  })));
});
