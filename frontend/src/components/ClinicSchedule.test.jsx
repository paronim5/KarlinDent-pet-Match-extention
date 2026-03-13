
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ClinicSchedule from "./ClinicSchedule";
import { useApi } from "../api/client";
import "@testing-library/jest-dom/vitest";

vi.mock("../api/client", () => ({
  useApi: vi.fn()
}));

const mockStaff = [
  { id: 1, first_name: "John", last_name: "Doe", role: "doctor", is_active: true },
  { id: 2, first_name: "Jane", last_name: "Smith", role: "assistant", is_active: true }
];

const mockShifts = [
  {
    id: 1,
    staff_id: 1,
    start: "2025-03-12T09:00:00.000Z",
    end: "2025-03-12T17:00:00.000Z",
    note: "Day Shift"
  }
];

describe("ClinicSchedule", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  };

  beforeEach(() => {
    useApi.mockReturnValue(mockApi);
    mockApi.get.mockImplementation((path) => {
      if (path === "/staff") return Promise.resolve(mockStaff);
      if (path.startsWith("/schedule")) return Promise.resolve(mockShifts);
      return Promise.reject(new Error("Not found"));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders staff and shifts", async () => {
    render(<ClinicSchedule />);
    
    // Wait for staff to load
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    // Wait for shifts to load
    await waitFor(() => {
      expect(screen.getByText("Day Shift")).toBeInTheDocument();
    });
  });

  test("opens modal on clicking Add Shift", async () => {
    render(<ClinicSchedule />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    const btn = screen.getAllByText("+ Add Shift")[0];
    fireEvent.click(btn);
    
    await waitFor(() => {
      expect(screen.getAllByText("New Shift").length).toBeGreaterThan(0);
      expect(screen.getAllByText("SCHEDULE STAFF").length).toBeGreaterThan(0);
    });
  });

  test("submits new shift", async () => {
    mockApi.post.mockResolvedValue({ id: 2, status: "created" });

    render(<ClinicSchedule />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    fireEvent.click(screen.getAllByText("+ Add Shift")[0]);

    await waitFor(() => {
      expect(screen.getAllByText("New Shift").length).toBeGreaterThan(0);
    });

    const noteInput = screen.getAllByPlaceholderText("Shift details...")[0];
    fireEvent.change(noteInput, { target: { value: "Night Shift" } });

    const saveBtn = screen.getAllByText("Save Shift →")[0];
    fireEvent.click(saveBtn);
    
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith("/schedule", expect.objectContaining({
        staff_id: 1,
        note: "Night Shift"
      }));
    });
  });
});
