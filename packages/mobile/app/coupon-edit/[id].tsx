import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Coupon, CouponCategory } from "@coupon/shared";
import { api } from "../../services/api";

type FormState = {
  code: string;
  title: string;
  description: string;
  store: string;
  category: CouponCategory;
  discountValue: string;
  discountType: "percentage" | "fixed";
  faceValue: string;
  cost: string;
  currency: string;
  expiresAt: string;
  eventDate: string;
  seatInfo: string;
  conditions: string;
  quantity: string;
  maxUsage: string;
  qrCode: string;
};

const CATEGORIES: CouponCategory[] = [
  "food", "retail", "travel", "entertainment", "health", "tech", "other",
];

function couponToForm(coupon: Coupon): { form: FormState; itemType: "coupon" | "voucher" } {
  const fixedCurrency =
    coupon.discount?.type === "fixed" ? coupon.discount.currency : undefined;
  return {
    itemType: coupon.itemType,
    form: {
      code: coupon.code,
      title: coupon.title,
      description: coupon.description ?? "",
      store: coupon.store,
      category: coupon.category,
      discountType: coupon.discount?.type ?? "percentage",
      discountValue: coupon.discount ? String(coupon.discount.value) : "",
      faceValue: coupon.faceValue ? String(coupon.faceValue) : "",
      cost: coupon.cost ? String(coupon.cost) : "",
      currency: fixedCurrency ?? coupon.currency ?? "ILS",
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
      eventDate: coupon.eventDate ? coupon.eventDate.slice(0, 10) : "",
      seatInfo: coupon.seatInfo ?? "",
      conditions: coupon.conditions ?? "",
      quantity: coupon.quantity ? String(coupon.quantity) : "",
      maxUsage: coupon.maxUsage ? String(coupon.maxUsage) : "",
      qrCode: coupon.qrCode ?? "",
    },
  };
}

export default function EditCouponScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [itemType, setItemType] = useState<"coupon" | "voucher">("coupon");
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof FormState, value: string) =>
    setForm((f) => f ? { ...f, [field]: value } : f);

  useEffect(() => {
    if (!id) return;
    api.coupons.get(id).then((coupon) => {
      const { form: f, itemType: t } = couponToForm(coupon);
      setForm(f);
      setItemType(t);
    }).catch(() => Alert.alert("Error", "Failed to load item."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!id || !form) return;
    if (!form.title || !form.store) {
      Alert.alert("Missing fields", "Please fill in title and store.");
      return;
    }
    setSaving(true);
    try {
      await api.coupons.update(id, {
        itemType,
        code: form.code || form.title.slice(0, 20),
        title: form.title,
        description: form.description || undefined,
        store: form.store,
        category: form.category,
        ...(itemType === "coupon" && form.discountValue
          ? {
              discount:
                form.discountType === "percentage"
                  ? { type: "percentage", value: parseFloat(form.discountValue) }
                  : { type: "fixed", value: parseFloat(form.discountValue), currency: form.currency || "ILS" },
            }
          : { discount: undefined }),
        ...(itemType === "voucher"
          ? {
              faceValue: form.faceValue ? parseFloat(form.faceValue) : undefined,
              cost: form.cost ? parseFloat(form.cost) : undefined,
              currency: form.currency || undefined,
            }
          : {}),
        expiresAt: form.expiresAt || undefined,
        eventDate: form.eventDate || undefined,
        seatInfo: form.seatInfo || undefined,
        conditions: form.conditions || undefined,
        quantity: form.quantity ? parseInt(form.quantity, 10) : undefined,
        maxUsage: form.maxUsage ? parseInt(form.maxUsage, 10) : undefined,
        qrCode: form.qrCode || undefined,
      });
      router.replace(`/coupon/${id}`);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (!form) return <Text style={styles.center}>Item not found.</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Type toggle */}
      <View style={styles.typeToggle}>
        {(["coupon", "voucher"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typeBtn, itemType === t && styles.typeBtnActive]}
            onPress={() => setItemType(t)}
          >
            <Text style={[styles.typeBtnText, itemType === t && styles.typeBtnTextActive]}>
              {t === "coupon" ? "Coupon" : "Voucher"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Title *</Text>
      <TextInput style={styles.input} value={form.title} onChangeText={(v) => set("title", v)} />

      <Text style={styles.label}>Code / Barcode</Text>
      <TextInput style={styles.input} value={form.code} onChangeText={(v) => set("code", v)} autoCapitalize="characters" />

      <Text style={styles.label}>Store *</Text>
      <TextInput style={styles.input} value={form.store} onChangeText={(v) => set("store", v)} />

      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.catChip, form.category === c && styles.catChipActive]}
            onPress={() => set("category", c)}
          >
            <Text style={[styles.catChipText, form.category === c && styles.catChipTextActive]}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {itemType === "coupon" ? (
        <>
          <Text style={styles.label}>Discount</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={form.discountValue}
              onChangeText={(v) => set("discountValue", v)}
              keyboardType="numeric"
              placeholder="Amount"
            />
            <TouchableOpacity
              style={styles.toggleBtn}
              onPress={() => set("discountType", form.discountType === "percentage" ? "fixed" : "percentage")}
            >
              <Text style={styles.toggleBtnText}>{form.discountType === "percentage" ? "%" : form.currency}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Face value (what you get)</Text>
          <TextInput style={styles.input} value={form.faceValue} onChangeText={(v) => set("faceValue", v)} keyboardType="numeric" />
          <Text style={styles.label}>Cost (what you paid)</Text>
          <TextInput style={styles.input} value={form.cost} onChangeText={(v) => set("cost", v)} keyboardType="numeric" />
          <Text style={styles.label}>Currency</Text>
          <TextInput style={styles.input} value={form.currency} onChangeText={(v) => set("currency", v)} placeholder="ILS, USD…" />
        </>
      )}

      <Text style={styles.label}>Expiry date</Text>
      <TextInput style={styles.input} value={form.expiresAt} onChangeText={(v) => set("expiresAt", v)} placeholder="YYYY-MM-DD" keyboardType="numeric" />

      {itemType === "voucher" && (
        <>
          <Text style={styles.label}>Event date</Text>
          <TextInput style={styles.input} value={form.eventDate} onChangeText={(v) => set("eventDate", v)} placeholder="YYYY-MM-DD" keyboardType="numeric" />
          <Text style={styles.label}>Seat / Location info</Text>
          <TextInput style={styles.input} value={form.seatInfo} onChangeText={(v) => set("seatInfo", v)} />
          <Text style={styles.label}>Quantity</Text>
          <TextInput style={styles.input} value={form.quantity} onChangeText={(v) => set("quantity", v)} keyboardType="numeric" />
        </>
      )}

      <Text style={styles.label}>Conditions / Restrictions</Text>
      <TextInput style={styles.input} value={form.conditions} onChangeText={(v) => set("conditions", v)} />

      <Text style={styles.label}>QR Code / Barcode data</Text>
      <TextInput style={styles.input} value={form.qrCode} onChangeText={(v) => set("qrCode", v)} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={form.description}
        onChangeText={(v) => set("description", v)}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Changes"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, textAlign: "center", marginTop: 40 },

  typeToggle: {
    flexDirection: "row", backgroundColor: "#e8e8ed", borderRadius: 8, padding: 3, marginBottom: 20,
  },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 6 },
  typeBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  typeBtnText: { fontWeight: "600", color: "#999", fontSize: 14 },
  typeBtnTextActive: { color: "#333" },

  label: { fontSize: 13, fontWeight: "600", color: "#333", marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 8,
    padding: 11, fontSize: 15, backgroundColor: "#fff",
  },
  multiline: { height: 80 },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },

  toggleBtn: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 8, backgroundColor: "#fff",
    paddingHorizontal: 14, alignItems: "center", justifyContent: "center", minWidth: 52,
  },
  toggleBtnText: { fontSize: 15, fontWeight: "600", color: "#333" },

  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd",
  },
  catChipActive: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  catChipText: { fontSize: 13, fontWeight: "600", color: "#555" },
  catChipTextActive: { color: "#fff" },

  saveBtn: { marginTop: 32, backgroundColor: "#007AFF", padding: 15, borderRadius: 10, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  cancelBtn: { marginTop: 12, padding: 15, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "#ddd" },
  cancelBtnText: { color: "#666", fontWeight: "600", fontSize: 15 },
});
