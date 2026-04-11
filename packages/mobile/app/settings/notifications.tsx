import { useEffect, useState } from "react";
import {
  View,
  Text,
  Switch,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import type { NotificationPreferences } from "@coupon/shared";
import { api } from "../../services/api";

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.notifications
      .getPreferences()
      .then(setPrefs)
      .catch((err) =>
        Alert.alert("Error", err.message ?? "Failed to load settings.")
      )
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const updated = await api.notifications.updatePreferences(prefs);
      setPrefs(updated);
      Alert.alert("Saved", "Notification preferences updated.");
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {prefs && (
        <View style={styles.card}>
          {/* Global toggle */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowTitle}>Expiry alerts</Text>
              <Text style={styles.rowSub}>
                Get notified before your coupons expire
              </Text>
            </View>
            <Switch
              value={prefs.enabled}
              onValueChange={(val) => setPrefs({ ...prefs, enabled: val })}
              trackColor={{ true: "#007AFF" }}
            />
          </View>

          <View style={styles.separator} />

          {/* Days before */}
          <View style={[styles.row, !prefs.enabled && styles.rowDisabled]}>
            <Text style={styles.rowTitle}>Alert days before expiry</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={[styles.stepBtn, prefs.daysBeforeExpiry <= 1 && styles.stepBtnDisabled]}
                onPress={() =>
                  setPrefs({ ...prefs, daysBeforeExpiry: Math.max(1, prefs.daysBeforeExpiry - 1) })
                }
                disabled={!prefs.enabled || prefs.daysBeforeExpiry <= 1}
              >
                <Text style={styles.stepBtnText}>–</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.daysInput}
                value={String(prefs.daysBeforeExpiry)}
                keyboardType="number-pad"
                editable={prefs.enabled}
                onChangeText={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n)) setPrefs({ ...prefs, daysBeforeExpiry: Math.max(1, Math.min(30, n)) });
                }}
              />
              <TouchableOpacity
                style={[styles.stepBtn, prefs.daysBeforeExpiry >= 30 && styles.stepBtnDisabled]}
                onPress={() =>
                  setPrefs({ ...prefs, daysBeforeExpiry: Math.min(30, prefs.daysBeforeExpiry + 1) })
                }
                disabled={!prefs.enabled || prefs.daysBeforeExpiry >= 30}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving || !prefs}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  rowLeft: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#111" },
  rowSub: { fontSize: 12, color: "#888", marginTop: 2 },
  rowDisabled: { opacity: 0.4 },
  separator: { height: 1, backgroundColor: "#f0f0f0" },

  stepperRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { color: "#fff", fontSize: 20, lineHeight: 24, fontWeight: "700" },
  daysInput: {
    width: 48,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    borderBottomWidth: 2,
    borderBottomColor: "#007AFF",
    paddingBottom: 2,
  },

  saveBtn: {
    backgroundColor: "#007AFF",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
