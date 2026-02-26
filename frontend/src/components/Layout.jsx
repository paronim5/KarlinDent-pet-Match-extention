import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function Layout({ children }) {
  const location = useLocation();
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("theme-light");
    } else {
      document.body.classList.remove("theme-light");
    }
  }, [theme]);

  const items = [
    { to: "/clinic", label: "Clinic" },
    { to: "/income", label: "Income" },
    { to: "/outcome", label: "Outcome" },
    { to: "/staff", label: "Staff" }
  ];

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">Policlinic Management</div>
        <div className="app-user">
          <button
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "Dark theme" : "White theme"}
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-nav" role="navigation" aria-label="Main">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={
                location.pathname.startsWith(item.to)
                  ? "nav-link nav-link-active"
                  : "nav-link"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
