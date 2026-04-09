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
import type { Coupon } from "@coupon/shared";
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

export default function CouponDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);

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
    Alert.alert(`Delete ${label}`, "Are you sure?", [
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

  const trackingTotal =
    coupon.discount?.type === "fixed"
      ? coupon.discount.value
      : coupon.faceValue ?? null;
  const trackingCurrency =
    coupon.discount?.type === "fixed"
      ? coupon.discount.currency
      : coupon.currency ?? "";
  const remaining = trackingTotal !== null ? trackingTotal - (coupon.amountUsed ?? 0) : null;

  const value = formatValue(coupon);
  const isVoucher = coupon.itemType === "voucher";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {coupon.imageUrl && (
        <Image source={{ uri: coupon.imageUrl }} style={styles.image} resizeMode="contain" />
      )}

      <View style={styles.titleRow}>
        <Text style={styles.title}>{coupon.title}</Text>
        <View style={[styles.typeBadge, isVoucher && styles.typeBadgeVoucher]}>
          <Text style={[styles.typeBadgeText, isVoucher && styles.typeBadgeTextVoucher]}>
            {isVoucher ? "Voucher" : "Coupon"}
          </Text>
        </View>
      </View>

      <Text style={styles.code}>{coupon.code}</Text>

      <Row label="Store" value={coupon.store} />
      <Row label="Category" value={coupon.category} />
      {value && <Row label="Value" value={value} />}
      {coupon.qrCode && <Row label="QR Code" value={coupon.qrCode} />}
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

      <TouchableOpacity style={[styles.btn, styles.deleteBtn]} onPress={handleDelete}>
        <Text style={styles.btnText}>Delete {isVoucher ? "Voucher" : "Coupon"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
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
  typeBadge: {
    backgroundColor: "#f0f4ff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  typeBadgeVoucher: { backgroundColor: "#f0fff4" },
  typeBadgeText: { fontSize: 11, fontWeight: "700", color: "#007AFF" },
  typeBadgeTextVoucher: { color: "#34C759" },
  code: { fontSize: 18, color: "#007AFF", fontFamily: "monospace", marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  label: { fontWeight: "600", color: "#333", flex: 1 },
  value: { color: "#333", flex: 2, textAlign: "right" },
  amountBlock: { marginTop: 16, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 8 },
  amountText: { fontSize: 14, color: "#333", marginBottom: 8 },
  amountRow: { flexDirection: "row", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  amountInput: { flex: 1 },
  btn: { marginTop: 16, padding: 14, borderRadius: 8, alignItems: "center" },
  saveBtn: { backgroundColor: "#007AFF", marginTop: 0 },
  deleteBtn: { backgroundColor: "#FF3B30" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
