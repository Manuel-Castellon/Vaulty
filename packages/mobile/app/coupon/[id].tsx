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
    Alert.alert("Delete Coupon", "Are you sure?", [
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
  if (!coupon) return <Text style={styles.notFound}>Coupon not found.</Text>;

  const isFixed = coupon.discount.type === "fixed";
  const total = isFixed ? coupon.discount.value : null;
  const remaining = total !== null ? total - (coupon.amountUsed ?? 0) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {coupon.imageUrl && (
        <Image source={{ uri: coupon.imageUrl }} style={styles.image} resizeMode="contain" />
      )}

      <Text style={styles.title}>{coupon.title}</Text>
      <Text style={styles.code}>{coupon.code}</Text>

      <Row label="Store" value={coupon.store} />
      <Row label="Category" value={coupon.category} />

      {coupon.qrCode && <Row label="QR Code" value={coupon.qrCode} />}
      {coupon.description && <Row label="Description" value={coupon.description} />}
      {coupon.expiresAt && (
        <Row label="Expires" value={new Date(coupon.expiresAt).toLocaleDateString()} />
      )}

      <Row
        label="Discount"
        value={
          isFixed
            ? `${coupon.discount.currency} ${coupon.discount.value}`
            : `${coupon.discount.value}%`
        }
      />

      {isFixed && total !== null && (
        <View style={styles.amountBlock}>
          <Text style={styles.amountText}>
            {coupon.discount.currency} {coupon.amountUsed ?? 0} used of {total}{" "}
            ({coupon.discount.currency} {remaining} remaining)
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
        <Text style={styles.btnText}>Delete Coupon</Text>
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
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
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
  btn: {
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveBtn: { backgroundColor: "#007AFF", marginTop: 0 },
  deleteBtn: { backgroundColor: "#FF3B30" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
