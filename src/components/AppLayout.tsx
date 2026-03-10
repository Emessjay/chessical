import { Outlet } from "react-router-dom";
import { NavLink } from "react-router-dom";

export function AppLayout() {
  return (
    <div className="app-wrapper">
      <header className="app-header">
        <nav className="app-nav">
          <NavLink
            to="/openings"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Openings
          </NavLink>
          <NavLink
            to="/analysis"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Analysis
          </NavLink>
          <NavLink
            to="/trainer"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Trainer
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Settings
          </NavLink>
        </nav>
        <span className="app-title">Chessical</span>
      </header>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
