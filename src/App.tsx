import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LibraryLayout } from "./components/LibraryLayout";
import { LoginPage } from "./pages/LoginPage";
import { AccountPage } from "./pages/AccountPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/openings" replace />} />

          {/* Openings hub (subtabs: library / learn / practice) */}
          <Route path="openings" element={<Navigate to="/openings/library" replace />} />
          <Route path="openings/*" element={<LibraryLayout />} />

          {/* Back-compat redirects */}
          <Route path="library" element={<Navigate to="/openings/library" replace />} />
          <Route path="learn" element={<Navigate to="/openings/learn" replace />} />
          <Route path="practice" element={<Navigate to="/openings/practice" replace />} />

          <Route path="settings" element={<SettingsPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/openings" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
