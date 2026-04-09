import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { handleAuthCallback } from "../../services/auth";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    if (!code) {
      router.replace("/login");
      return;
    }

    handleAuthCallback(code)
      .then(() => {
        router.replace("/");
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [code]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.text}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f7f8fa",
    gap: 16,
  },
  text: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
});
