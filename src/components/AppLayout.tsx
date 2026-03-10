import { Outlet } from "react-router-dom";
import { Link, NavLink } from "react-router-dom";

export function AppLayout() {
  return (
    <div className="app-wrapper">
      <header className="app-header">
        <nav className="app-nav">
          <NavLink
            to="/library"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Library
          </NavLink>
          <NavLink
            to="/learn"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Learn
          </NavLink>
          <NavLink
            to="/practice"
            className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
          >
            Practice
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
