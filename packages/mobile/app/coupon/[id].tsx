import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import type { Coupon, CouponStatus } from "@coupon/shared";
import { api } from "../../services/api";

function formatValue(coupon: Coupon): string | null {
  if (coupon.discount) {
    if (coupon.discount.type === "percentage") return `${coupon.discount.value}% OFF`;
    return `${coupon.discount.currency} ${coupon.discount.value} OFF`;
  }
  if (coupon.faceValue) {
    const cur = coupon.currency ?? "";
    if (coupon.cost) return `${cur} ${coupon.faceValue} value (paid ${cur} ${coupon.cost})`.trim();
    return `${cur} ${coupon.faceValue} value`.trim();
  }
  return null;
}

function effectiveStatus(coupon: Coupon): CouponStatus {
  const s = coupon.status ?? "active";
  if (s === "used" || s === "archived") return s;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return "expired";
  return "active";
}

export default function CouponDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showQrRaw, setShowQrRaw] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.coupons
      .get(id)
      .then((c) => {
        setCoupon(c);
        setAmountInput(String(c.amountUsed ?? 0));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = () => {
    const label = coupon?.itemType === "voucher" ? "Voucher" : "Coupon";
    Alert.alert(`Delete ${label}`, "This cannot be undone. Consider archiving instead.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await api.coupons.delete(id!);
          router.back();
        },
      },
    ]);
  };

  const handleStatusUpdate = async (status: CouponStatus) => {
    if (!id || !coupon) return;
    setStatusUpdating(true);
    try {
      const updated = await api.coupons.update(id, { status });
      setCoupon(updated);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAmountSave = async () => {
    if (!id || !coupon) return;
    const parsed = parseFloat(amountInput);
    if (isNaN(parsed)) return;
    setSaving(true);
    try {
      const updated = await api.coupons.update(id, { amountUsed: parsed });
      setCoupon(updated);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (!coupon) return <Text style={styles.notFound}>Item not found.</Text>;

  const status = effectiveStatus(coupon);
  const trackingTotal =
    coupon.discount?.type === "fixed" ? coupon.discount.value : coupon.faceValue ?? null;
  const trackingCurrency =
    coupon.discount?.type === "fixed" ? coupon.discount.currency : coupon.currency ?? "";
  const remaining = trackingTotal !== null ? trackingTotal - (coupon.amountUsed ?? 0) : null;

  const value = formatValue(coupon);
  const isVoucher = coupon.itemType === "voucher";

  const STATUS_BADGE_STYLE: Record<CouponStatus, object> = {
    active: styles.statusBadgeActive,
    used: styles.statusBadgeUsed,
    archived: styles.statusBadgeArchived,
    expired: styles.statusBadgeExpired,
  };
  const STATUS_TEXT_STYLE: Record<CouponStatus, object> = {
    active: styles.statusTextActive,
    used: styles.statusTextUsed,
    archived: styles.statusTextArchived,
    expired: styles.statusTextExpired,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {coupon.imageUrl && (
        <Image source={{ uri: coupon.imageUrl }} style={styles.image} resizeMode="contain" />
      )}

      <View style={styles.titleRow}>
        <Text style={styles.title}>{coupon.title}</Text>
        <View style={styles.badgeGroup}>
          <View style={[styles.typeBadge, isVoucher && styles.typeBadgeVoucher]}>
            <Text style={[styles.typeBadgeText, isVoucher && styles.typeBadgeTextVoucher]}>
              {isVoucher ? "Voucher" : "Coupon"}
            </Text>
          </View>
          {status !== "active" && (
            <View style={[styles.typeBadge, STATUS_BADGE_STYLE[status]]}>
              <Text style={[styles.typeBadgeText, STATUS_TEXT_STYLE[status]]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.code}>{coupon.code}</Text>

      <Row label="Store" value={coupon.store} />
      <Row label="Category" value={coupon.category} />
      {value && <Row label="Value" value={value} />}
      {(coupon.qrCode || coupon.qrImageUrl) && (
        <View style={styles.qrBlock}>
          <Text style={styles.rowLabel}>QR Code</Text>
          {coupon.qrCode
            ? <QRCode value={coupon.qrCode} size={180} />
            : <Image source={{ uri: coupon.qrImageUrl }} style={{ width: 180, height: 180 }} resizeMode="contain" />
          }
          {coupon.qrCode && (
            <>
              <TouchableOpacity style={styles.rawToggleBtn} onPress={() => setShowQrRaw((value) => !value)}>
                <Text style={styles.rawToggleBtnText}>
                  {showQrRaw ? "Hide raw scan data" : "Show raw scan data"}
                </Text>
              </TouchableOpacity>
              {showQrRaw && <Text style={styles.qrRaw}>{coupon.qrCode}</Text>}
            </>
          )}
        </View>
      )}
      {coupon.issueDate && (
        <Row label="Issued" value={new Date(coupon.issueDate).toLocaleDateString()} />
      )}
      {coupon.description && <Row label="Description" value={coupon.description} />}
      {coupon.conditions && <Row label="Conditions" value={coupon.conditions} />}
      {coupon.eventDate && (
        <Row label="Event date" value={new Date(coupon.eventDate).toLocaleDateString()} />
      )}
      {coupon.seatInfo && <Row label="Seats" value={coupon.seatInfo} />}
      {coupon.quantity && coupon.quantity > 1 && (
        <Row label="Quantity" value={String(coupon.quantity)} />
      )}
      {coupon.expiresAt && (
        <Row label="Expires" value={new Date(coupon.expiresAt).toLocaleDateString()} />
      )}
      <Row
        label="Times used"
        value={coupon.maxUsage ? `${coupon.usageCount} of ${coupon.maxUsage}` : String(coupon.usageCount)}
      />

      {trackingTotal !== null && (
        <View style={styles.amountBlock}>
          <Text style={styles.amountText}>
            {trackingCurrency} {coupon.amountUsed ?? 0} used of {trackingTotal}{" "}
            ({trackingCurrency} {remaining} remaining)
          </Text>
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.input, styles.amountInput]}
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="numeric"
              placeholder="Amount used"
            />
            <TouchableOpacity
              style={[styles.btn, styles.saveBtn]}
              onPress={handleAmountSave}
              disabled={saving}
            >
              <Text style={styles.btnText}>{saving ? "Saving…" : "Update"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Lifecycle actions */}
      <View style={styles.lifecycleRow}>
        <TouchableOpacity
          style={[styles.lifecycleBtn, styles.lifecycleBtnUsed, status === "used" && styles.lifecycleBtnUsedActive]}
          onPress={() => handleStatusUpdate(status === "used" ? "active" : "used")}
          disabled={statusUpdating}
        >
          <Text style={[styles.lifecycleBtnText, styles.lifecycleBtnUsedText]}>
            {status === "used" ? "✓ Used" : "Mark Used"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.lifecycleBtn, styles.lifecycleBtnArchived, status === "archived" && styles.lifecycleBtnArchivedActive]}
          onPress={() => handleStatusUpdate(status === "archived" ? "active" : "archived")}
          disabled={statusUpdating}
        >
          <Text style={[styles.lifecycleBtnText, styles.lifecycleBtnArchivedText]}>
            {status === "archived" ? "✓ Archived" : "Archive"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Edit + Delete */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.btn, styles.editBtn]}
          onPress={() => router.push(`/coupon-edit/${id}`)}
        >
          <Text style={styles.btnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.deleteBtn]} onPress={handleDelete}>
          <Text style={styles.btnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  center: { flex: 1 },
  notFound: { margin: 16, color: "#999" },
  image: { width: "100%", height: 200, marginBottom: 16, borderRadius: 8 },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", flex: 1 },
  badgeGroup: { flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 140 },
  typeBadge: {
    backgroundColor: "#f0f4ff", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start",
  },
  typeBadgeVoucher: { backgroundColor: "#f0fff4" },
  typeBadgeText: { fontSize: 11, fontWeight: "700", color: "#007AFF" },
  typeBadgeTextVoucher: { color: "#34C759" },

  // Status badge variants
  statusBadgeActive: { backgroundColor: "#f0f4ff" },
  statusBadgeUsed: { backgroundColor: "#fff8e7" },
  statusBadgeArchived: { backgroundColor: "#f5f5f5" },
  statusBadgeExpired: { backgroundColor: "#fff0f0" },
  statusTextActive: { color: "#007AFF" },
  statusTextUsed: { color: "#c07000" },
  statusTextArchived: { color: "#888" },
  statusTextExpired: { color: "#FF3B30" },

  code: { fontSize: 18, color: "#007AFF", fontFamily: "monospace", marginBottom: 16 },
  row: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eee",
  },
  rowLabel: { fontWeight: "600", color: "#333", flex: 1 },
  rowValue: { color: "#333", flex: 2, textAlign: "right" },

  amountBlock: { marginTop: 16, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 8 },
  amountText: { fontSize: 14, color: "#333", marginBottom: 8 },
  amountRow: { flexDirection: "row", gap: 8 },
  input: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 6, padding: 10, fontSize: 15, backgroundColor: "#fff",
  },
  amountInput: { flex: 1 },

  qrBlock: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee", alignItems: "center", gap: 8,
  },
  rawToggleBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#d8dbe2",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rawToggleBtnText: { fontSize: 12, fontWeight: "600", color: "#475467" },
  qrRaw: { fontSize: 11, color: "#aaa", fontFamily: "monospace", textAlign: "center" },

  // Lifecycle buttons
  lifecycleRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  lifecycleBtn: {
    flex: 1, padding: 12, borderRadius: 8, alignItems: "center",
    borderWidth: 1,
  },
  lifecycleBtnUsed: { backgroundColor: "#fff8e7", borderColor: "#ffd07a" },
  lifecycleBtnUsedActive: { backgroundColor: "#ffd07a" },
  lifecycleBtnArchived: { backgroundColor: "#f5f5f5", borderColor: "#ddd" },
  lifecycleBtnArchivedActive: { backgroundColor: "#ddd" },
  lifecycleBtnText: { fontWeight: "600", fontSize: 14 },
  lifecycleBtnUsedText: { color: "#c07000" },
  lifecycleBtnArchivedText: { color: "#666" },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  btn: { flex: 1, padding: 14, borderRadius: 8, alignItems: "center" },
  saveBtn: { backgroundColor: "#007AFF", marginTop: 0 },
  editBtn: { backgroundColor: "#007AFF" },
  deleteBtn: { backgroundColor: "#FF3B30" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
