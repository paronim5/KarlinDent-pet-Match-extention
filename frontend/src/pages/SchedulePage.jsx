
import React from "react";
import ClinicSchedule from "../components/ClinicSchedule";

export default function SchedulePage() {
  return (
    <div style={{ height: "calc(100vh - 70px)", overflow: "hidden", margin: "-36px", width: "calc(100% + 72px)" }}>
      <ClinicSchedule />
    </div>
  );
}
