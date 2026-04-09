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
import { useRouter, useLocalSearchParams } from "expo-router";
import { confirmSignUp, resendConfirmationCode } from "../services/auth";

export default function ConfirmScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleConfirm = async () => {
    if (!code) {
      Alert.alert("Missing code", "Please enter the confirmation code.");
      return;
    }
    if (!email) {
      Alert.alert("Error", "Missing email. Please go back and try again.");
      return;
    }
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      Alert.alert("Account confirmed!", "You can now sign in.", [
        { text: "Sign in", onPress: () => router.replace("/login") },
      ]);
    } catch (err: any) {
      Alert.alert("Confirmation failed", err.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await resendConfirmationCode(email);
      Alert.alert("Code resent", "Check your email for the new code.");
    } catch (err: any) {
      Alert.alert("Failed to resend", err.message ?? "Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.logo}>Vaulty</Text>
      <Text style={styles.title}>Confirm your account</Text>
      <Text style={styles.subtitle}>
        We sent a verification code to{"\n"}
        <Text style={styles.emailHighlight}>{email}</Text>
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>Confirmation Code</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          placeholder="123456"
          placeholderTextColor="#aaa"
          maxLength={6}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleConfirm}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? "Confirming…" : "Confirm account"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendBtn}
          onPress={handleResend}
          disabled={resending}
        >
          <Text style={styles.resendText}>
            {resending ? "Resending…" : "Resend code"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => router.push("/login")}>
          <Text style={styles.link}>← Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    color: "#007AFF",
    textAlign: "center",
    marginBottom: 32,
    letterSpacing: -1,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 28,
    lineHeight: 22,
  },
  emailHighlight: {
    fontWeight: "600",
    color: "#333",
  },
  form: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 22,
    color: "#111",
    backgroundColor: "#fff",
    letterSpacing: 6,
    textAlign: "center",
  },
  btn: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  resendBtn: {
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  resendText: { color: "#007AFF", fontSize: 14, fontWeight: "600" },
  footer: {
    alignItems: "center",
    marginTop: 8,
  },
  link: { fontSize: 14, color: "#007AFF", fontWeight: "600" },
});
