import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LibraryLayout } from "./components/LibraryLayout";
import { EvaluatePage } from "./pages/EvaluatePage";
import { SettingsPage } from "./pages/SettingsPage";
import "./App.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/openings" replace />} />

        {/* Openings hub (subtabs: library / learn / practice) */}
        <Route path="openings" element={<Navigate to="/openings/library" replace />} />
        <Route path="openings/*" element={<LibraryLayout />} />

        {/* Back-compat redirects */}
        <Route path="library" element={<Navigate to="/openings/library" replace />} />
        <Route path="learn" element={<Navigate to="/openings/learn" replace />} />
        <Route path="practice" element={<Navigate to="/openings/practice" replace />} />

        <Route path="evaluate" element={<EvaluatePage />} />

        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/openings" replace />} />
    </Routes>
  );
}

export default App;
