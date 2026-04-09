import { useState } from "react";
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
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { CouponCategory, ExtractionResult } from "@coupon/shared";
import { api } from "../services/api";

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
};

const EMPTY_FORM: FormState = {
  code: "", title: "", description: "", store: "",
  category: "other", discountValue: "", discountType: "percentage",
  faceValue: "", cost: "", currency: "ILS",
  expiresAt: "", eventDate: "", seatInfo: "", conditions: "",
  quantity: "", maxUsage: "",
};

const CATEGORIES: CouponCategory[] = [
  "food", "retail", "travel", "entertainment", "health", "tech", "other",
];

function applyExtraction(extracted: ExtractionResult): { form: Partial<FormState>; itemType: "coupon" | "voucher" } {
  const itemType = extracted.itemType ?? "coupon";
  const form: Partial<FormState> = {};
  if (extracted.title) form.title = extracted.title;
  if (extracted.store) form.store = extracted.store;
  if (extracted.code) form.code = extracted.code;
  if (extracted.description) form.description = extracted.description;
  if (extracted.category) form.category = extracted.category;
  if (extracted.currency) form.currency = extracted.currency;
  if (extracted.faceValue) form.faceValue = String(extracted.faceValue);
  if (extracted.cost) form.cost = String(extracted.cost);
  if (extracted.conditions) form.conditions = extracted.conditions;
  if (extracted.seatInfo) form.seatInfo = extracted.seatInfo;
  if (extracted.quantity) form.quantity = String(extracted.quantity);
  if (extracted.expiresAt) form.expiresAt = extracted.expiresAt.slice(0, 10);
  if (extracted.eventDate) form.eventDate = extracted.eventDate.slice(0, 10);
  if (extracted.discount) {
    form.discountType = extracted.discount.type as "percentage" | "fixed";
    form.discountValue = String(extracted.discount.value);
    if (extracted.discount.type === "fixed") form.currency = extracted.discount.currency;
  }
  return { form, itemType };
}

export default function AddCouponScreen() {
  const router = useRouter();
  const [itemType, setItemType] = useState<"coupon" | "voucher">("coupon");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleExtract = async (base64: string, mimeType: string) => {
    setExtracting(true);
    try {
      const extracted = await api.ai.extract({ data: base64, mimeType });
      const { form: ef, itemType: et } = applyExtraction(extracted);
      setItemType(et);
      setForm((f) => ({ ...f, ...ef }));
    } catch (err: any) {
      Alert.alert("Extraction failed", err.message);
    } finally {
      setExtracting(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0].base64) {
      await handleExtract(result.assets[0].base64, result.assets[0].mimeType ?? "image/jpeg");
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera access is needed to scan vouchers.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
    if (!result.canceled && result.assets[0].base64) {
      await handleExtract(result.assets[0].base64, "image/jpeg");
    }
  };

  const handleSave = async () => {
    if (!form.title || !form.store) {
      Alert.alert("Missing fields", "Please fill in title and store.");
      return;
    }
    setSaving(true);
    try {
      await api.coupons.create({
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
          : {}),
        ...(itemType === "voucher" && form.faceValue
          ? {
              faceValue: parseFloat(form.faceValue),
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
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* AI scan row */}
      <View style={styles.extractCard}>
        <Text style={styles.extractLabel}>Auto-fill from photo or text</Text>
        <View style={styles.scanRow}>
          <TouchableOpacity style={styles.scanBtn} onPress={takePhoto} disabled={extracting}>
            <Text style={styles.scanBtnText}>📷 Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scanBtn} onPress={pickImage} disabled={extracting}>
            <Text style={styles.scanBtnText}>🖼 Gallery</Text>
          </TouchableOpacity>
          {extracting && <ActivityIndicator color="#007AFF" />}
        </View>
      </View>

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
      <TextInput
        style={styles.input}
        value={form.title}
        onChangeText={(v) => set("title", v)}
        placeholder={itemType === "coupon" ? "e.g. 20% off summer sale" : "e.g. Two family pizzas"}
      />

      <Text style={styles.label}>Code / Barcode</Text>
      <TextInput
        style={styles.input}
        value={form.code}
        onChangeText={(v) => set("code", v)}
        placeholder="e.g. SUMMER20"
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Store *</Text>
      <TextInput
        style={styles.input}
        value={form.store}
        onChangeText={(v) => set("store", v)}
        placeholder="e.g. Domino's"
      />

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
          <TextInput
            style={styles.input}
            value={form.faceValue}
            onChangeText={(v) => set("faceValue", v)}
            keyboardType="numeric"
            placeholder="e.g. 200 (leave blank for item vouchers)"
          />
          <Text style={styles.label}>Cost (what you paid)</Text>
          <TextInput
            style={styles.input}
            value={form.cost}
            onChangeText={(v) => set("cost", v)}
            keyboardType="numeric"
            placeholder="e.g. 100"
          />
          <Text style={styles.label}>Currency</Text>
          <TextInput
            style={styles.input}
            value={form.currency}
            onChangeText={(v) => set("currency", v)}
            placeholder="ILS, USD…"
          />
        </>
      )}

      <Text style={styles.label}>Expiry date</Text>
      <TextInput
        style={styles.input}
        value={form.expiresAt}
        onChangeText={(v) => set("expiresAt", v)}
        placeholder="YYYY-MM-DD"
        keyboardType="numeric"
      />

      {itemType === "voucher" && (
        <>
          <Text style={styles.label}>Event date</Text>
          <TextInput
            style={styles.input}
            value={form.eventDate}
            onChangeText={(v) => set("eventDate", v)}
            placeholder="YYYY-MM-DD"
            keyboardType="numeric"
          />
          <Text style={styles.label}>Seat / Location info</Text>
          <TextInput
            style={styles.input}
            value={form.seatInfo}
            onChangeText={(v) => set("seatInfo", v)}
            placeholder="e.g. Row 7, Seats 1-2"
          />
          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={form.quantity}
            onChangeText={(v) => set("quantity", v)}
            keyboardType="numeric"
            placeholder="e.g. 2"
          />
        </>
      )}

      <Text style={styles.label}>Conditions / Restrictions</Text>
      <TextInput
        style={styles.input}
        value={form.conditions}
        onChangeText={(v) => set("conditions", v)}
        placeholder="e.g. Valid at Rami Levi only"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={form.description}
        onChangeText={(v) => set("description", v)}
        multiline
        numberOfLines={3}
        placeholder="Optional notes…"
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>
          {saving ? "Saving…" : `Save ${itemType === "coupon" ? "Coupon" : "Voucher"}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { padding: 16, paddingBottom: 48 },

  extractCard: {
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#c0d0ff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  extractLabel: { fontSize: 11, fontWeight: "700", color: "#555", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  scanRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  scanBtn: {
    flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#c0d0ff",
    borderRadius: 8, paddingVertical: 10, alignItems: "center",
  },
  scanBtnText: { fontSize: 14, fontWeight: "600", color: "#007AFF" },

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
});
