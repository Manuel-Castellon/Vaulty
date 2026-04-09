import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  FlatList,
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import type { Coupon } from "@coupon/shared";
import { api } from "../services/api";

type StatusTab = "active" | "expired";
type ItemTypeTab = "all" | "coupon" | "voucher";

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

function formatValue(coupon: Coupon): string | null {
  if (coupon.discount) {
    if (coupon.discount.type === "percentage") return `${coupon.discount.value}% OFF`;
    return `${coupon.discount.currency} ${coupon.discount.value} OFF`;
  }
  if (coupon.faceValue) {
    const cur = coupon.currency ?? "";
    return `${cur} ${coupon.faceValue} value`.trim();
  }
  return null;
}

export default function CouponsScreen() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [itemTypeTab, setItemTypeTab] = useState<ItemTypeTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Coupon[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCoupons = useCallback(() => {
    setLoading(true);
    api.coupons
      .list()
      .then((res) => setCoupons(res.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(fetchCoupons);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.ai.search({ query: searchQuery.trim() });
        setSearchResults(res.items);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 600);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  const isSearchMode = searchQuery.trim().length > 0;

  const filtered = useMemo(() => {
    if (searchResults !== null) return searchResults;
    return coupons
      .filter((c) => (statusTab === "active" ? !isExpired(c) : isExpired(c)))
      .filter((c) => itemTypeTab === "all" || c.itemType === itemTypeTab);
  }, [coupons, statusTab, itemTypeTab, searchResults]);

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder='Search — try "pizza vouchers"…'
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {searching && <ActivityIndicator style={styles.searchSpinner} size="small" />}
      </View>

      {/* Status + type tabs — hidden while searching */}
      {!isSearchMode && (
        <>
          <View style={styles.tabBar}>
            {(["active", "expired"] as StatusTab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, statusTab === tab && styles.tabActive]}
                onPress={() => setStatusTab(tab)}
              >
                <Text style={[styles.tabText, statusTab === tab && styles.tabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.typeTabBar}>
            {(["all", "coupon", "voucher"] as ItemTypeTab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeTab, itemTypeTab === t && styles.typeTabActive]}
                onPress={() => setItemTypeTab(t)}
              >
                <Text style={[styles.typeTabText, itemTypeTab === t && styles.typeTabTextActive]}>
                  {t === "all" ? "All" : t === "coupon" ? "Coupons" : "Vouchers"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const expired = isExpired(item);
          const expiry = expiryLabel(item);
          const expiringSoon =
            !expired && item.expiresAt !== undefined && daysUntilExpiry(item.expiresAt) <= 7;
          const value = formatValue(item);
          const isVoucher = item.itemType === "voucher";

          return (
            <TouchableOpacity
              style={[styles.item, expired && styles.itemExpired]}
              onPress={() => router.push(`/coupon/${item.id}`)}
            >
              <View style={styles.itemHeader}>
                <Text style={[styles.title, expired && styles.textDimmed]}>{item.title}</Text>
                <View style={[styles.badge, expired && styles.badgeExpired, isVoucher && !expired && styles.badgeVoucher]}>
                  <Text style={[styles.badgeText, expired && styles.badgeTextExpired, isVoucher && !expired && styles.badgeTextVoucher]}>
                    {expired ? "Expired" : isVoucher ? "Voucher" : item.category}
                  </Text>
                </View>
              </View>
              <Text style={[styles.sub, expired && styles.textDimmed]}>
                {item.store}{value ? ` · ${value}` : ""}
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
            {isSearchMode ? "No matches found." : statusTab === "active" ? "No active items." : "No expired items."}
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

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#f2f2f7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  searchSpinner: { marginLeft: 8 },

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
  tabActive: { borderBottomColor: "#007AFF" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#999" },
  tabTextActive: { color: "#007AFF" },

  typeTabBar: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  typeTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: "transparent",
  },
  typeTabActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  typeTabText: { fontSize: 12, fontWeight: "600", color: "#999" },
  typeTabTextActive: { color: "#333" },

  item: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  itemExpired: { opacity: 0.5 },
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
  badgeExpired: { backgroundColor: "#fff0f0" },
  badgeVoucher: { backgroundColor: "#f0fff4" },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#007AFF", textTransform: "capitalize" },
  badgeTextExpired: { color: "#FF3B30" },
  badgeTextVoucher: { color: "#34C759" },

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
