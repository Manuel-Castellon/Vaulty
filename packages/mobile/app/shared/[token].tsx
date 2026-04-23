import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import type { SharedCouponView } from "@coupon/shared";
import { api } from "../../services/api";
import { formatDate } from "../../utils/date";
import { isRTL } from "../../utils/bidi";

function formatValue(c: SharedCouponView): string | null {
  if (c.discount) {
    if (c.discount.type === "percentage") return `${c.discount.value}% OFF`;
    return `${c.discount.currency} ${c.discount.value} OFF`;
  }
  if (c.faceValue) {
    const cur = c.currency ?? "";
    if (c.cost) return `${cur} ${c.faceValue} value (paid ${cur} ${c.cost})`.trim();
    return `${cur} ${c.faceValue} value`.trim();
  }
  return null;
}

export default function SharedCouponPreviewScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [coupon, setCoupon] = useState<SharedCouponView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.sharing
      .getPreview(token)
      .then(setCoupon)
      .catch((err) => setError(err.message ?? "Share link not found"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleClaim = async () => {
    if (!token) return;
    setClaiming(true);
    try {
      await api.sharing.claim(token);
      setClaimed(true);
      Alert.alert("Added!", "The coupon has been added to your Vaulty.", [
        { text: "View My Coupons", onPress: () => router.replace("/") },
        { text: "Stay here", style: "cancel" },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to claim coupon");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} size="large" color="#007AFF" />;

  if (error || !coupon) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>🔗</Text>
        <Text style={styles.errorText}>{error ?? "Share link not found"}</Text>
        <Text style={styles.errorSub}>This link may have been revoked or doesn't exist.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace("/")}>
          <Text style={styles.backBtnText}>Go to My Coupons</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const value = formatValue(coupon);
  const isVoucher = coupon.itemType === "voucher";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.sharedBadge}>
        <Text style={styles.sharedBadgeText}>Shared with you</Text>
      </View>

      {/* Hero */}
      <View style={[styles.heroCard, isVoucher && styles.heroCardVoucher]}>
        <Text style={[styles.heroTitle, isRTL(coupon.title) && styles.rtl]}>{coupon.title}</Text>
        <Text style={styles.heroStore}>{coupon.store}</Text>
        {value && <Text style={styles.heroValue}>{value}</Text>}
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>CODE</Text>
          <Text style={styles.codeValue}>{coupon.code}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailsCard}>
        {coupon.description && <Row label="Description" value={coupon.description} />}
        {coupon.conditions && <Row label="Conditions" value={coupon.conditions} />}
        {coupon.expiresAt && <Row label="Expires" value={formatDate(coupon.expiresAt)} />}
        {coupon.eventDate && <Row label="Event date" value={formatDate(coupon.eventDate)} />}
        {coupon.seatInfo && <Row label="Seats" value={coupon.seatInfo} />}
        {coupon.category && <Row label="Category" value={coupon.category} />}
        {coupon.qrCode && (
          <View style={styles.qrBlock}>
            <Text style={styles.rowLabel}>QR Code</Text>
            <QRCode value={coupon.qrCode} size={160} />
          </View>
        )}
      </View>

      {/* Claim CTA */}
      {claimed ? (
        <View style={styles.claimedBox}>
          <Text style={styles.claimedTitle}>Added to your Vaulty!</Text>
          <TouchableOpacity onPress={() => router.replace("/")}>
            <Text style={styles.claimedLink}>View My Coupons →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.claimBtn, claiming && styles.claimBtnDisabled]}
          onPress={handleClaim}
          disabled={claiming}
        >
          {claiming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.claimBtnText}>Add to My Vaulty</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, isRTL(value) && styles.rtl]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { padding: 16 },
  center: {
    flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#f7f8fa",
  },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorText: { fontSize: 16, fontWeight: "700", color: "#ff3b30", textAlign: "center", marginBottom: 8 },
  errorSub: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 24 },
  backBtn: { backgroundColor: "#007AFF", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  backBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  sharedBadge: {
    backgroundColor: "#f0f4ff", alignSelf: "flex-start", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4, marginBottom: 14,
  },
  sharedBadgeText: { color: "#007AFF", fontWeight: "700", fontSize: 12 },

  heroCard: {
    backgroundColor: "#007AFF", borderRadius: 16, padding: 24, marginBottom: 16,
  },
  heroCardVoucher: { backgroundColor: "#34C759" },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 4 },
  heroStore: { fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 12 },
  heroValue: { fontSize: 34, fontWeight: "900", color: "#fff", marginBottom: 12, letterSpacing: -1 },
  codeBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    alignSelf: "flex-start",
  },
  codeLabel: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  codeValue: { fontSize: 16, fontWeight: "800", color: "#fff", fontFamily: "monospace", letterSpacing: 2 },

  detailsCard: {
    backgroundColor: "#fff", borderRadius: 12, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: "#f5f5f5",
  },
  rowLabel: { fontWeight: "600", color: "#888", fontSize: 13, flex: 1 },
  rowValue: { color: "#111", fontSize: 14, flex: 2, textAlign: "right" },
  rtl: { textAlign: "right", writingDirection: "rtl" },
  qrBlock: {
    paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5", alignItems: "center", gap: 12,
  },

  claimBtn: {
    backgroundColor: "#007AFF", borderRadius: 12, paddingVertical: 16,
    alignItems: "center", marginTop: 4,
  },
  claimBtnDisabled: { opacity: 0.6 },
  claimBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  claimedBox: {
    backgroundColor: "#f0fff4", borderWidth: 1, borderColor: "#34C759",
    borderRadius: 12, padding: 20, alignItems: "center", gap: 8,
  },
  claimedTitle: { fontWeight: "700", color: "#1e8e3e", fontSize: 16 },
  claimedLink: { color: "#007AFF", fontWeight: "600", fontSize: 14 },
});
