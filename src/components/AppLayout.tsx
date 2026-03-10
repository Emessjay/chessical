import { Outlet } from "react-router-dom";
import { Link, NavLink } from "react-router-dom";

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
            to="/settings"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Settings
          </NavLink>
          <Link to="/account" className="app-nav-link">
            Account
          </Link>
        </nav>
        <span className="app-title">Chessical</span>
      </header>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
