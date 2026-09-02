import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import invoiceIcon from "../assets/invoice.svg";
import { changelogEntries } from "../data/changelog";

const THEME_KEY = "invoicee-theme";
type Theme = "light" | "dark";

function detectInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function Layout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  const currentVersion = changelogEntries[0]?.version ?? "";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-dark", theme === "dark");
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand-link" aria-label="Invoicee - Přehled">
          <img src={invoiceIcon} alt="Logo aplikace" className="brand-icon" />
          <h1>Invoicee</h1>
        </Link>
        <div className="topbar-actions">
          <nav>
            <NavLink to="/" className={({ isActive }) => (isActive ? "active" : "") }>
              Přehled
            </NavLink>
            <NavLink to="/invoices" className={({ isActive }) => (isActive ? "active" : "") }>
              Faktury
            </NavLink>
            <NavLink to="/contacts" className={({ isActive }) => (isActive ? "active" : "") }>
              Kontakty
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "") }>
              Nastavení
            </NavLink>
          </nav>
          <div className="theme-mode-picker" role="group" aria-label="Výběr tématu">
            <button
              type="button"
              className="theme-icon-button"
              aria-label="Světlý režim"
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
                <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
              </svg>
            </button>
            <button
              type="button"
              className="theme-icon-button"
              aria-label="Tmavý režim"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="app-footer">
        <Link to="/changelog" className="app-footer-link">
          Changelog
        </Link>
        {currentVersion ? <div className="app-footer-version-chip">{currentVersion}</div> : null}
      </footer>
    </div>
  );
}
