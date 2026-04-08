import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import type { CouponCategory } from "@coupon/shared";
import { api } from "../services/api";

export default function AddCouponScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    code: "",
    title: "",
    description: "",
    store: "",
    category: "other" as CouponCategory,
    discountValue: "",
    discountType: "percentage" as "percentage" | "fixed",
  });

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.code || !form.title || !form.store || !form.discountValue) {
      Alert.alert("Missing fields", "Please fill in title, code, store, and discount.");
      return;
    }
    try {
      await api.coupons.create({
        code: form.code,
        title: form.title,
        description: form.description || undefined,
        store: form.store,
        category: form.category,
        discount:
          form.discountType === "percentage"
            ? { type: "percentage", value: parseFloat(form.discountValue) }
            : {
                type: "fixed",
                value: parseFloat(form.discountValue),
                currency: "USD",
              },
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Title *</Text>
      <TextInput style={styles.input} value={form.title} onChangeText={(v) => set("title", v)} />

      <Text style={styles.label}>Coupon Code *</Text>
      <TextInput
        style={styles.input}
        value={form.code}
        onChangeText={(v) => set("code", v)}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Store *</Text>
      <TextInput style={styles.input} value={form.store} onChangeText={(v) => set("store", v)} />

      <Text style={styles.label}>Discount *</Text>
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
          onPress={() =>
            set("discountType", form.discountType === "percentage" ? "fixed" : "percentage")
          }
        >
          <Text>{form.discountType === "percentage" ? "%" : "$"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={form.description}
        onChangeText={(v) => set("description", v)}
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Coupon</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  label: { fontWeight: "600", marginTop: 16, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
  },
  flex: { flex: 1 },
  multiline: { height: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 8 },
  toggle: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
  },
  saveBtn: {
    marginTop: 32,
    backgroundColor: "#007AFF",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
