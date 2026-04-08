import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Coupon } from "@coupon/shared";
import { api } from "../../services/api";

export default function CouponDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.coupons
      .get(id)
      .then(setCoupon)
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

  if (loading) return <ActivityIndicator style={styles.center} />;
  if (!coupon) return <Text style={styles.notFound}>Coupon not found.</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{coupon.title}</Text>
      <Text style={styles.code}>{coupon.code}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Store</Text>
        <Text>{coupon.store}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Category</Text>
        <Text>{coupon.category}</Text>
      </View>
      {coupon.description && (
        <View style={styles.row}>
          <Text style={styles.label}>Description</Text>
          <Text>{coupon.description}</Text>
        </View>
      )}
      {coupon.expiresAt && (
        <View style={styles.row}>
          <Text style={styles.label}>Expires</Text>
          <Text>{new Date(coupon.expiresAt).toLocaleDateString()}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
        <Text style={styles.deleteBtnText}>Delete Coupon</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1 },
  notFound: { margin: 16, color: "#999" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  code: {
    fontSize: 18,
    color: "#007AFF",
    fontFamily: "monospace",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  label: { fontWeight: "600", color: "#333" },
  deleteBtn: {
    marginTop: 32,
    backgroundColor: "#FF3B30",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  deleteBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
