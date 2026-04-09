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
};

const EMPTY_FORM: FormState = {
  code: "", title: "", description: "", store: "",
  category: "other", discountValue: "", discountType: "percentage",
  faceValue: "", cost: "", currency: "ILS",
};

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
      const mimeType = result.assets[0].mimeType ?? "image/jpeg";
      await handleExtract(result.assets[0].base64, mimeType);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera access is needed to scan vouchers.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0].base64) {
      await handleExtract(result.assets[0].base64, "image/jpeg");
    }
  };

  const handleSave = async () => {
    if (!form.code || !form.title || !form.store) {
      Alert.alert("Missing fields", "Please fill in title, code, and store.");
      return;
    }
    try {
      await api.coupons.create({
        itemType,
        code: form.code,
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
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* AI scan row */}
      <View style={styles.scanRow}>
        <TouchableOpacity style={styles.scanBtn} onPress={takePhoto} disabled={extracting}>
          <Text style={styles.scanBtnText}>📷 Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scanBtn} onPress={pickImage} disabled={extracting}>
          <Text style={styles.scanBtnText}>🖼 Upload</Text>
        </TouchableOpacity>
        {extracting && <ActivityIndicator style={{ marginLeft: 8 }} />}
      </View>

      {/* Type toggle */}
      <View style={styles.typeToggle}>
        <TouchableOpacity
          style={[styles.typeBtn, itemType === "coupon" && styles.typeBtnActive]}
          onPress={() => setItemType("coupon")}
        >
          <Text style={[styles.typeBtnText, itemType === "coupon" && styles.typeBtnTextActive]}>
            Coupon
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeBtn, itemType === "voucher" && styles.typeBtnActive]}
          onPress={() => setItemType("voucher")}
        >
          <Text style={[styles.typeBtnText, itemType === "voucher" && styles.typeBtnTextActive]}>
            Voucher
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Title *</Text>
      <TextInput
        style={styles.input}
        value={form.title}
        onChangeText={(v) => set("title", v)}
        placeholder={itemType === "coupon" ? "e.g. 20% off summer sale" : "e.g. Domino's — two family pizzas"}
      />

      <Text style={styles.label}>Code / Barcode *</Text>
      <TextInput
        style={styles.input}
        value={form.code}
        onChangeText={(v) => set("code", v)}
        placeholder="e.g. SUMMER20 or 2360647438"
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Store *</Text>
      <TextInput style={styles.input} value={form.store} onChangeText={(v) => set("store", v)} />

      {itemType === "coupon" ? (
        <>
          <Text style={styles.label}>Discount</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={form.discountValue}
              onChangeText={(v) => set("discountValue", v)}
              keyboardType="numeric"
              placeholder="e.g. 20"
            />
            <TouchableOpacity
              style={styles.toggle}
              onPress={() => set("discountType", form.discountType === "percentage" ? "fixed" : "percentage")}
            >
              <Text>{form.discountType === "percentage" ? "%" : form.currency}</Text>
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
            placeholder="e.g. 100 (leave blank if gifted)"
          />
          <Text style={styles.label}>Currency</Text>
          <TextInput
            style={styles.input}
            value={form.currency}
            onChangeText={(v) => set("currency", v)}
            placeholder="e.g. ILS, USD"
          />
        </>
      )}

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={form.description}
        onChangeText={(v) => set("description", v)}
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>
          Save {itemType === "coupon" ? "Coupon" : "Voucher"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },

  scanRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    alignItems: "center",
  },
  scanBtn: {
    flex: 1,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#c0d0ff",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  scanBtnText: { fontSize: 14, fontWeight: "600", color: "#007AFF" },

  typeToggle: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    padding: 3,
    marginBottom: 20,
  },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 6 },
  typeBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  typeBtnText: { fontWeight: "600", color: "#999", fontSize: 14 },
  typeBtnTextActive: { color: "#333" },

  label: { fontWeight: "600", marginTop: 16, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 6, padding: 10, fontSize: 15 },
  flex: { flex: 1 },
  multiline: { height: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 8 },
  toggle: {
    borderWidth: 1, borderColor: "#ddd", borderRadius: 6,
    padding: 10, alignItems: "center", justifyContent: "center", minWidth: 48,
  },
  saveBtn: { marginTop: 32, backgroundColor: "#007AFF", padding: 14, borderRadius: 8, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
