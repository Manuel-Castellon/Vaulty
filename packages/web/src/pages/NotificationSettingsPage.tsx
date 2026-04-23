import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { NotificationPreferences } from "@coupon/shared";
import { api } from "../services/api";
import styles from "./couponDetail.module.css";

export default function NotificationSettingsPage() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.notifications
      .getPreferences()
      .then(setPrefs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await api.notifications.updatePreferences(prefs);
      setPrefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className={styles.center}>Loading…</p>;

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate("/")}>
        ← Back
      </button>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>
        Notification Settings
      </h1>

      {error && (
        <p style={{ color: "#ff3b30", marginBottom: 16, fontSize: 14 }}>{error}</p>
      )}

      {prefs && (
        <div className={styles.detailsCard}>
          {/* Global enable/disable */}
          <div className={styles.row} style={{ alignItems: "center" }}>
            <span className={styles.rowLabel}>Expiry alerts</span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.enabled}
                  onChange={(e) => setPrefs({ ...prefs, enabled: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <span style={{ fontSize: 14, color: "#333" }}>
                  {prefs.enabled ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>
          </div>

          {/* Notify on claim */}
          <div className={styles.row} style={{ alignItems: "center" }}>
            <span className={styles.rowLabel}>Sharing alerts</span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.notifyOnClaim ?? true}
                  onChange={(e) => setPrefs({ ...prefs, notifyOnClaim: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <span style={{ fontSize: 14, color: "#333" }}>
                  Notify me when someone claims my shared coupon
                </span>
              </label>
            </div>
          </div>

          {/* Days before expiry */}
          <div className={styles.row} style={{ alignItems: "center" }}>
            <span className={styles.rowLabel}>Alert days before</span>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                min={1}
                max={30}
                value={prefs.daysBeforeExpiry}
                disabled={!prefs.enabled}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    daysBeforeExpiry: Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)),
                  })
                }
                style={{
                  width: 72,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 15,
                  opacity: prefs.enabled ? 1 : 0.5,
                }}
              />
              <span style={{ marginLeft: 8, fontSize: 14, color: "#666" }}>
                day{prefs.daysBeforeExpiry !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className={styles.updateBtn}
          onClick={handleSave}
          disabled={saving || !prefs}
          style={{ minWidth: 100 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span style={{ fontSize: 14, color: "#34c759", fontWeight: 600 }}>
            Saved!
          </span>
        )}
      </div>
    </div>
  );
}
