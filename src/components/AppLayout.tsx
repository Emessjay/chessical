import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";

export function AppLayout() {
  return (
    <div className="app-wrapper">
      <header className="app-header">
        <nav className="app-nav">
          <Link to="/" className="app-nav-link">
            Openings
          </Link>
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
