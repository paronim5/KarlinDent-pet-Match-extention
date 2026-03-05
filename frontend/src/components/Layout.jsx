import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function Layout({ children }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const items = [
    { to: "/clinic", label: t("nav.dashboard"), icon: "⬡" },
    { to: "/income", label: t("nav.income"), icon: "↗" },
    { to: "/outcome", label: t("nav.expenses"), icon: "↙" },
    { to: "/staff", label: t("nav.staff"), icon: "◈" },
    { to: "/my-income", label: t("nav.my_income"), icon: "◧" },
  ];

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="shell">
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-mark">M</div>
          <div className="logo-text">
            Med<span>Pay</span>
          </div>
        </div>

        <nav className="nav-section">
          <div className="nav-label">{t("nav.overview")}</div>
          {items.slice(0, 3).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname.startsWith(item.to) ? "nav-item active" : "nav-item"}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.workforce")}</div>
          {items.slice(3, 4).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname.startsWith(item.to) ? "nav-item active" : "nav-item"}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>

        <nav className="nav-section" style={{ marginTop: "20px" }}>
          <div className="nav-label">{t("nav.payroll")}</div>
          {items.slice(4, 5).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={location.pathname.startsWith(item.to) ? "nav-item active" : "nav-item"}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="language-switcher" style={{ marginBottom: "20px", display: "flex", gap: "10px", padding: "0 12px" }}>
            <button 
              className={`btn btn-ghost btn-sm ${i18n.language === 'en' ? 'active' : ''}`} 
              onClick={() => changeLanguage('en')}
              style={{ padding: "4px 8px", fontSize: "12px", background: i18n.language.startsWith('en') ? "var(--bg-card)" : "transparent" }}
            >
              EN
            </button>
            <button 
              className={`btn btn-ghost btn-sm ${i18n.language === 'ru' ? 'active' : ''}`} 
              onClick={() => changeLanguage('ru')}
              style={{ padding: "4px 8px", fontSize: "12px", background: i18n.language.startsWith('ru') ? "var(--bg-card)" : "transparent" }}
            >
              RU
            </button>
          </div>
          <div className="clinic-badge">
            <div className="clinic-avatar">HC</div>
            <div>
              <div className="clinic-name">HealthCare+</div>
              <div className="clinic-sub">MAR 2025</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!isSidebarOpen)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div>
            <div className="topbar-title">
              {items.find((item) => location.pathname.startsWith(item.to))?.label || t("nav.dashboard")}
            </div>
            <div className="topbar-sub">MARCH 2025 · {t("common.period_active")}</div>
          </div>
          <div className="topbar-actions">
            <div className="date-strip">
              <button className="date-chip active">MO</button>
            </div>
            <button className="btn btn-ghost">⇣ {t("nav.export")}</button>
            <button className="btn btn-primary">+ {t("nav.add_income")}</button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
