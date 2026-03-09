import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface User {
  id: string;
  username: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const api = (path: string, options?: RequestInit) =>
  fetch(path, { ...options, credentials: "include" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const loadUser = useCallback(async () => {
    try {
      const res = await api("/api/me");
      if (res.ok) {
        const data = await res.json();
        setUser({ id: data.id, username: data.username });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      const res = await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        throw new Error(data.error ?? "Login failed");
      }
      setUser({ id: data.id, username: data.username });
    },
    []
  );

  const register = useCallback(
    async (username: string, password: string) => {
      setError(null);
      const res = await api("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        throw new Error(data.error ?? "Registration failed");
      }
      setUser({ id: data.id, username: data.username });
    },
    []
  );

  const logout = useCallback(async () => {
    await api("/api/logout", { method: "POST" });
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    register,
    error,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
