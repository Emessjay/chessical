import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="account-page">
      <div className="account-card">
        <h1 className="account-title">Account</h1>
        <p className="account-user">
          Logged in as <strong>{user.username}</strong>
        </p>
        <nav className="account-nav">
          <button
            type="button"
            className="account-button account-button-logout"
            onClick={handleLogout}
          >
            Log out
          </button>
        </nav>
      </div>
    </div>
  );
}
