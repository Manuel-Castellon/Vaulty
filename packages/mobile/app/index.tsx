import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  FlatList,
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import type { Coupon, CouponStatus } from "@coupon/shared";
import { api } from "../services/api";
import { formatDate } from "../utils/date";
import { isRTL } from "../utils/bidi";

type StatusFilter = "all" | "active" | "used" | "archived" | "expired";
type ItemTypeTab = "all" | "coupon" | "voucher";
type SortOption = "expiry" | "added" | "merchant" | "category" | "status";

function daysUntilExpiry(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function expiryLabel(coupon: Coupon): string {
  if (!coupon.expiresAt) return "No expiry";
  const days = daysUntilExpiry(coupon.expiresAt);
  if (days < 0) return `Expired ${formatDate(coupon.expiresAt)}`;
  if (days === 0) return "Expires today!";
  if (days <= 7) return `Expires in ${days} day${days !== 1 ? "s" : ""}`;
  return `Expires ${formatDate(coupon.expiresAt)}`;
}

function effectiveStatus(coupon: Coupon): CouponStatus {
  const s = coupon.status ?? "active";
  if (s === "used" || s === "archived") return s;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return "expired";
  return "active";
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

const STATUS_ORDER: Record<CouponStatus, number> = { active: 0, used: 1, archived: 2, expired: 3 };

export default function CouponsScreen() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [itemTypeTab, setItemTypeTab] = useState<ItemTypeTab>("all");
  const [sortBy, setSortBy] = useState<SortOption>("expiry");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Coupon[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sortPickerVisible, setSortPickerVisible] = useState(false);
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

    let result = coupons
      .filter((c) => statusFilter === "all" || effectiveStatus(c) === statusFilter)
      .filter((c) => itemTypeTab === "all" || c.itemType === itemTypeTab);

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "expiry": {
          if (!a.expiresAt && !b.expiresAt) return 0;
          if (!a.expiresAt) return 1;
          if (!b.expiresAt) return -1;
          return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
        }
        case "added":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "merchant":
          return a.store.localeCompare(b.store);
        case "category":
          return a.category.localeCompare(b.category);
        case "status":
          return STATUS_ORDER[effectiveStatus(a)] - STATUS_ORDER[effectiveStatus(b)];
      }
    });

    return result;
  }, [coupons, statusFilter, itemTypeTab, sortBy, searchResults]);

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (error) return <Text style={styles.error}>{error}</Text>;

  const SORT_OPTIONS: { key: SortOption; label: string }[] = [
    { key: "expiry", label: "Expiring soon" },
    { key: "added", label: "Newest" },
    { key: "merchant", label: "Merchant" },
    { key: "category", label: "Category" },
    { key: "status", label: "Status" },
  ];

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

      {/* Tabs + sort — hidden while searching */}
      {!isSearchMode && (
        <>
          {/* Status filter tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScrollView} contentContainerStyle={styles.tabScrollContent} nestedScrollEnabled={false}>
            {(["all", "active", "used", "archived", "expired"] as StatusFilter[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.tab, statusFilter === s && styles.tabActive]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[styles.tabText, statusFilter === s && styles.tabTextActive]}>
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Type tabs */}
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

          {/* Sort button */}
          <View style={styles.sortBar}>
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortPickerVisible(true)}>
              <Text style={styles.sortButtonText}>
                Sort: {SORT_OPTIONS.find((o) => o.key === sortBy)?.label} ▾
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          coupons.length === 0 && !isSearchMode ? (
            <View style={styles.emptyVault}>
              <Text style={styles.emptyVaultTitle}>Your vault is empty</Text>
              <Text style={styles.emptyVaultSub}>
                Tap + to add your first coupon or voucher.
              </Text>
            </View>
          ) : (
            <Text style={styles.empty}>
              {isSearchMode ? "No matches found." : "No items match your filters."}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const status = effectiveStatus(item);
          const isDimmed = status !== "active";
          const expiry = expiryLabel(item);
          const expiringSoon = status === "active" && item.expiresAt !== undefined && daysUntilExpiry(item.expiresAt) <= 7;
          const value = formatValue(item);
          const isVoucher = item.itemType === "voucher";

          return (
            <TouchableOpacity
              style={[styles.item, isDimmed && styles.itemDimmed]}
              onPress={() => router.push(`/coupon/${item.id}`)}
            >
              <View style={styles.itemHeader}>
                <Text style={[styles.title, isDimmed && styles.textDimmed, isRTL(item.title) && styles.rtl]}>{item.title}</Text>
                <View style={styles.badgeRow}>
                  {/* Type/category badge */}
                  <View style={[styles.badge, isVoucher && styles.badgeVoucher]}>
                    <Text style={[styles.badgeText, isVoucher && styles.badgeTextVoucher]}>
                      {isVoucher ? "Voucher" : item.category}
                    </Text>
                  </View>
                  {/* Category badge for vouchers */}
                  {isVoucher && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.category}</Text>
                    </View>
                  )}
                  {/* Status badge for non-active */}
                  {status !== "active" && (
                    <View style={[styles.badge, styles[`badge_${status}` as keyof typeof styles] as object]}>
                      <Text style={[styles.badgeText, styles[`badgeText_${status}` as keyof typeof styles] as object]}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={[styles.sub, isDimmed && styles.textDimmed]}>
                {item.store}{value ? ` · ${value}` : ""}
              </Text>
              <Text style={[
                styles.expiry,
                status === "expired" ? styles.expiryExpired : expiringSoon ? styles.expiryWarn : styles.expiryNormal,
              ]}>
                {expiry}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push(
          itemTypeTab === "voucher" ? "/add?itemType=voucher" : "/add"
        )}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Sort picker modal — at end of tree to avoid layout interference on Android */}
      <Modal
        visible={sortPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortPickerVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSortPickerVisible(false)}>
          <View style={styles.sortSheet}>
            <Text style={styles.sortSheetTitle}>Sort by</Text>
            {SORT_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.sortSheetItem, sortBy === key && styles.sortSheetItemActive]}
                onPress={() => { setSortBy(key); setSortPickerVisible(false); }}
              >
                <Text style={[styles.sortSheetItemText, sortBy === key && styles.sortSheetItemTextActive]}>
                  {label}
                </Text>
                {sortBy === key && <Text style={styles.sortSheetCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1 },
  list: { flex: 1 },
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

  tabScrollView: { borderBottomWidth: 1, borderBottomColor: "#eee", flexGrow: 0, flexShrink: 0 },
  tabScrollContent: { paddingHorizontal: 8 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: "#007AFF" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#999", lineHeight: 20 },
  tabTextActive: { color: "#007AFF" },

  typeTabBar: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  typeTab: {
    flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 6, backgroundColor: "transparent",
  },
  typeTabActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  typeTabText: { fontSize: 12, fontWeight: "600", color: "#999", lineHeight: 18 },
  typeTabTextActive: { color: "#333" },

  sortBar: {
    backgroundColor: "#fafafa",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  sortButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  sortButtonText: { fontSize: 13, fontWeight: "600", color: "#333", lineHeight: 18 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sortSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  sortSheetTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sortSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sortSheetItemActive: { backgroundColor: "#f0f4ff" },
  sortSheetItemText: { fontSize: 16, color: "#333" },
  sortSheetItemTextActive: { fontWeight: "700", color: "#007AFF" },
  sortSheetCheck: { fontSize: 16, color: "#007AFF", fontWeight: "700" },

  item: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  itemDimmed: { opacity: 0.55 },
  itemHeader: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: "600", flex: 1 },
  textDimmed: { color: "#888" },
  rtl: { textAlign: "right", writingDirection: "rtl" },

  badgeRow: { flexDirection: "row", gap: 4, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 140 },
  badge: {
    backgroundColor: "#f0f4ff", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeVoucher: { backgroundColor: "#f0fff4" },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#007AFF", textTransform: "capitalize" },
  badgeTextVoucher: { color: "#34C759" },

  // Status badge variants — accessed via dynamic key
  badge_expired: { backgroundColor: "#fff0f0" },
  badge_used: { backgroundColor: "#fff8e7" },
  badge_archived: { backgroundColor: "#f5f5f5" },
  badgeText_expired: { color: "#FF3B30" },
  badgeText_used: { color: "#c07000" },
  badgeText_archived: { color: "#888" },

  sub: { fontSize: 13, color: "#666", marginBottom: 4 },
  expiry: { fontSize: 12, marginTop: 2 },
  expiryNormal: { color: "#999" },
  expiryWarn: { color: "#FF9500", fontWeight: "600" },
  expiryExpired: { color: "#FF3B30" },

  empty: { textAlign: "center", marginTop: 40, color: "#999" },
  emptyVault: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyVaultTitle: { fontSize: 20, fontWeight: "700", color: "#333", marginBottom: 8, textAlign: "center" },
  emptyVaultSub: { fontSize: 14, color: "#999", textAlign: "center", lineHeight: 20 },
  fab: {
    position: "absolute", bottom: 24, right: 24,
    backgroundColor: "#007AFF", width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 32 },
});
