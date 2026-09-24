import { Outlet, NavLink, useLocation } from "react-router-dom";

export function TrainerLayout() {
  const { pathname } = useLocation();
  return (
    <div className="trainer-layout">
      <div className="trainer-tabs" role="tablist" aria-label="Trainer tabs">
        <NavLink
          to="/trainer/autopsy"
          className={({ isActive }) => `trainer-tab ${isActive ? "active" : ""}`}
          role="tab"
          aria-selected={pathname.endsWith("/autopsy")}
        >
          Autopsy
        </NavLink>
        <NavLink
          to="/trainer/suite"
          className={({ isActive }) => `trainer-tab ${isActive ? "active" : ""}`}
          role="tab"
          aria-selected={pathname.endsWith("/suite") || pathname.endsWith("/endgame")}
        >
          Training suite
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
