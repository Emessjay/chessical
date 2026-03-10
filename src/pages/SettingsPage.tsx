import { useState } from "react";
import { getAllClearedUnitIds, resetAllClearedLines } from "../lib/learnProgress";

export function SettingsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const clearedCount = getAllClearedUnitIds().length;

  const handleResetClearedLines = () => {
    if (clearedCount === 0) {
      setMessage("No cleared lines to reset.");
      return;
    }
    const ok = window.confirm(
      `Reset all ${clearedCount} cleared line(s) to uncleared? Your progress (stage and wrong counts) will be kept; only the "cleared" status will be removed.`
    );
    if (!ok) return;
    const count = resetAllClearedLines();
    setMessage(`Reset ${count} line(s) to uncleared.`);
  };

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h1 className="settings-title">Settings</h1>

        <section className="settings-section">
          <h2 className="settings-section-title">Learn progress</h2>
          <p className="settings-description">
            Reset all lines you’ve marked as cleared back to uncleared. This does not remove your
            progress (e.g. arrows vs no-arrows or wrong counts); it only clears the “completed”
            status so lines appear again in Learn and Practice as not yet cleared.
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-button settings-button-reset"
              onClick={handleResetClearedLines}
              disabled={clearedCount === 0}
            >
              Reset all cleared lines to uncleared
            </button>
            {clearedCount > 0 && (
              <span className="settings-meta">
                {clearedCount} line{clearedCount !== 1 ? "s" : ""} currently cleared
              </span>
            )}
          </div>
          {message != null && (
            <p className="settings-message" role="status">
              {message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
