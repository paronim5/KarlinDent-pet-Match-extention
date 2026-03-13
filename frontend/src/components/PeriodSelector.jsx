
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

export default function PeriodSelector({ value, onChange, options = ["day", "week", "month", "year"] }) {
  const { t } = useTranslation();

  const labels = useMemo(() => ({
    year: t("income.period.year", "Year"),
    month: t("income.period.month", "Month"),
    week: t("income.period.week", "Week"),
    day: t("income.period.day", "Day")
  }), [t]);

  const shortLabels = {
    year: "YE",
    month: "MO",
    week: "WE",
    day: "DA"
  };

  return (
    <div className="date-strip">
      {options.map(p => (
        <button
          key={p}
          className={`date-chip ${value === p ? "active" : ""}`}
          aria-label={t("income.period_selector", "Time period selector")}
          title={labels[p]}
          onClick={() => onChange(p)}
        >
          {shortLabels[p]}
        </button>
      ))}
    </div>
  );
}
