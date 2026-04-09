import { useEffect, useState, useMemo } from "react";
import {
  FlatList,
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import type { Coupon } from "@coupon/shared";
import { api } from "../services/api";

type StatusTab = "active" | "expired";

function daysUntilExpiry(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

function expiryLabel(coupon: Coupon): string {
  if (!coupon.expiresAt) return "No expiry";
  const days = daysUntilExpiry(coupon.expiresAt);
  if (days < 0) return `Expired ${new Date(coupon.expiresAt).toLocaleDateString()}`;
  if (days === 0) return "Expires today!";
  if (days <= 7) return `Expires in ${days} day${days !== 1 ? "s" : ""}`;
  return `Expires ${new Date(coupon.expiresAt).toLocaleDateString()}`;
}

function isExpired(coupon: Coupon): boolean {
  return !!coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
}

export default function CouponsScreen() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>("active");

  useEffect(() => {
    api.coupons
      .list()
      .then((res) => setCoupons(res.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return coupons.filter((c) =>
      activeTab === "active" ? !isExpired(c) : isExpired(c),
    );
  }, [coupons, activeTab]);

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.tabBar}>
        {(["active", "expired"] as StatusTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const expired = isExpired(item);
          const expiry = expiryLabel(item);
          const expiringSoon =
            !expired &&
            item.expiresAt !== undefined &&
            daysUntilExpiry(item.expiresAt) <= 7;

          return (
            <TouchableOpacity
              style={[styles.item, expired && styles.itemExpired]}
              onPress={() => router.push(`/coupon/${item.id}`)}
            >
              <View style={styles.itemHeader}>
                <Text style={[styles.title, expired && styles.textDimmed]}>{item.title}</Text>
                <View style={[styles.badge, expired && styles.badgeExpired]}>
                  <Text style={[styles.badgeText, expired && styles.badgeTextExpired]}>
                    {expired ? "Expired" : item.category}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sub, expired && styles.textDimmed]}>
                {item.store} · {item.code}
              </Text>
              <Text style={[
                styles.expiry,
                expired ? styles.expiryExpired : expiringSoon ? styles.expiryWarn : styles.expiryNormal,
              ]}>
                {expiry}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {activeTab === "active" ? "No active coupons." : "No expired coupons."}
          </Text>
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/add")}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1 },
  error: { color: "red", margin: 16 },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#007AFF",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
  },
  tabTextActive: {
    color: "#007AFF",
  },

  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemExpired: {
    opacity: 0.5,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: "600", flex: 1 },
  textDimmed: { color: "#888" },

  badge: {
    backgroundColor: "#f0f4ff",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  badgeExpired: {
    backgroundColor: "#fff0f0",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#007AFF",
    textTransform: "capitalize",
  },
  badgeTextExpired: {
    color: "#FF3B30",
  },

  sub: { fontSize: 13, color: "#666", marginBottom: 4 },
  expiry: { fontSize: 12, marginTop: 2 },
  expiryNormal: { color: "#999" },
  expiryWarn: { color: "#FF9500", fontWeight: "600" },
  expiryExpired: { color: "#FF3B30" },

  empty: { textAlign: "center", marginTop: 40, color: "#999" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#007AFF",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 32 },
});
