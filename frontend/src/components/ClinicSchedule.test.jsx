
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ClinicSchedule from "./ClinicSchedule";
import { useApi } from "../api/client";
import "@testing-library/jest-dom/vitest";

vi.mock("../api/client", () => ({
  useApi: vi.fn()
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, vars = {}) => {
      const dict = {
        "schedule.add_shift": "+ Add Shift",
        "schedule.modal.new_shift": "New Shift",
        "schedule.modal.schedule_staff": "SCHEDULE STAFF",
        "schedule.modal.note_placeholder": "Shift details...",
        "schedule.modal.save_shift": "Save Shift →",
        "schedule.on_duty_today": "On Duty Today",
        "schedule.no_on_duty_today": "No doctors on duty today",
        "schedule.duty_item": `Dr. ${vars.lastName} – ${vars.role} ${vars.start}-${vars.end}`,
        "schedule.today": "Today",
        "schedule.calendar": "Calendar",
        "schedule.stats.shifts": "Shifts",
        "schedule.stats.visible_staff": "Visible staff",
        "schedule.stats.on_duty_now": "On duty now",
        "schedule.stats.roles": "Roles",
        "schedule.modal.edit_shift": "Edit Shift",
        "schedule.modal.update_details": "UPDATE DETAILS",
        "schedule.modal.staff_member": "Staff Member",
        "schedule.modal.start_time": "Start Time",
        "schedule.modal.end_time": "End Time",
        "schedule.modal.notes": "Notes",
        "schedule.modal.delete": "Delete",
        "schedule.modal.cancel": "Cancel",
        "schedule.errors.save_shift": `Failed to save shift: ${vars.message || ""}`,
        "schedule.errors.delete_shift": `Failed to delete shift: ${vars.message || ""}`,
        "schedule.errors.confirm_delete": "Are you sure you want to delete this shift?",
        "clinic.weekdays.mon": "Mo",
        "clinic.weekdays.tue": "Tu",
        "clinic.weekdays.wed": "We",
        "clinic.weekdays.thu": "Th",
        "clinic.weekdays.fri": "Fr",
        "clinic.weekdays.sat": "Sa",
        "clinic.weekdays.sun": "Su"
      };
      return dict[key] || key;
    }
  })
}));

const mockStaff = [
  { id: 1, first_name: "Alex", last_name: "Ivanov", role: "General Medicine", is_active: true },
  { id: 2, first_name: "Jane", last_name: "Smith", role: "assistant", is_active: true }
];

const todayISO = new Date().toISOString().slice(0, 10);
const mockShifts = [
  {
    id: 1,
    staff_id: 1,
    start: `${todayISO}T08:00:00`,
    end: `${todayISO}T16:00:00`,
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

  test("lists on-duty doctor for today in sidebar", async () => {
    render(<ClinicSchedule />);

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith("/staff");
    });

    await waitFor(() => {
      expect(screen.getByText("Dr. Ivanov – General Medicine 08:00-16:00")).toBeInTheDocument();
    });
  });
});
