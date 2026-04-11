import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { handleAuthCallback } from "../../services/auth";
import { useAuth } from "../../context/AuthContext";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const { code, error: oauthError, error_description: oauthErrorDescription } =
    useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (oauthError) {
      const desc = oauthErrorDescription ?? "";
      // Cognito returns invalid_request when the user already has an email/password
      // account and tries to sign in with Google using the same email.
      const isEmailConflict =
        oauthError === "invalid_request" ||
        desc.includes("already_exists") ||
        desc.includes("already exists");
      setError(
        isEmailConflict
          ? "An account with this email already exists. Sign in with your password instead."
          : `Sign-in failed: ${oauthError}${desc ? ` — ${desc}` : ""}`
      );
      return;
    }

    if (!code) {
      router.replace("/login");
      return;
    }

    handleAuthCallback(code)
      .then(async () => {
        await refreshAuth();
        router.replace("/");
      })
      .catch((err: any) => {
        console.warn("[auth/callback] OAuth error:", err?.message ?? err);
        setError(err?.message ?? "Sign-in failed. Please try again.");
      });
  }, [code, oauthError, oauthErrorDescription]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Sign-in failed</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace("/login")}>
          <Text style={styles.backBtnText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
    padding: 24,
  },
  text: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  errorMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  backBtn: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  backBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
