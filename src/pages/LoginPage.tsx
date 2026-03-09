import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const { login, register, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
      navigate(from, { replace: true });
    } catch {
      // Error already set in context
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Chessical</h1>
        <p className="login-subtitle">
          {isRegister ? "Create an account" : "Log in to access the opening library"}
        </p>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="login-username" className="login-label">
            Username
          </label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="login-input"
            required
          />
          <label htmlFor="login-password" className="login-label">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
            required
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <div className="login-actions">
            <button type="submit" className="login-button login-button-primary">
              {isRegister ? "Create account" : "Log in"}
            </button>
            <button
              type="button"
              className="login-button login-button-secondary"
              onClick={() => {
                setIsRegister((prev) => !prev);
                clearError();
              }}
            >
              {isRegister ? "Already have an account? Log in" : "Create an account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
