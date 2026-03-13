import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import OutcomePage from "./OutcomePage.jsx";

const getMock = vi.fn();

vi.mock("../api/client.js", () => ({
  useApi: () => ({
    get: getMock,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  })
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key
  })
}));

// Mock Chart.js to avoid canvas errors
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="line-chart" />
}));

beforeEach(() => {
  getMock.mockReset();
  localStorage.clear();
});

test("renders outcome page with chart in day view", async () => {
  const today = new Date().toISOString().split("T")[0];
  getMock.mockImplementation((path) => {
    if (path.startsWith("/outcome/records")) {
      return Promise.resolve([
        {
          id: 1,
          type: "outcome",
          amount: 100,
          date: today,
          created_at: `${today}T10:00:00Z`
        }
      ]);
    }
    return Promise.resolve([]);
  });

  // Set day view in localStorage
  localStorage.setItem("globalPeriod", "day");
  // The component computes its own range on mount if period is set
  // But we can also set the individual from/to if needed, though the component might overwrite them.
  // Actually, OutcomePage uses localStorage.getItem("globalPeriod") || "month"
  
  render(
    <MemoryRouter>
      <OutcomePage />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByTestId("line-chart")).toBeTruthy());
  expect(screen.getByText("outcome.history_title")).toBeTruthy();
});
