import { useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, Alert } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../services/api";
import { AuthProvider, useAuth } from "../context/AuthContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications(): Promise<void> {
  // Push notifications only work on physical devices
  if (Platform.OS === "web") return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === "granted") {
    // Already granted — register token and return
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      await api.pushTokens.register({ token: tokenData.data });
    } catch (err) {
      console.warn("[push] Failed to register push token:", err);
    }
    return;
  }

  // Don't re-ask if the user already denied the system dialog
  const alreadyDenied = await AsyncStorage.getItem("push_permission_denied");
  if (alreadyDenied === "true") return;

  // Soft ask — show rationale before the system permission dialog
  const userWantsToEnable = await new Promise<boolean>((resolve) => {
    Alert.alert(
      "Enable expiry reminders",
      "Get notified before your coupons expire so you never miss a deal.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Enable", onPress: () => resolve(true) },
      ]
    );
  });

  if (!userWantsToEnable) return;

  const { status } = await Notifications.requestPermissionsAsync();

  if (status !== "granted") {
    await AsyncStorage.setItem("push_permission_denied", "true");
    return;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await api.pushTokens.register({ token: tokenData.data });
  } catch (err) {
    console.warn("[push] Failed to register push token:", err);
  }
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutInner />
    </AuthProvider>
  );
}

function RootLayoutInner() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, loading, userEmail, authProvider, signOut } = useAuth();

  useEffect(() => {
    if (isAuthenticated) registerForPushNotifications();
  }, [isAuthenticated]);

  // Navigate to a coupon when user taps a push notification
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const couponId = response.notification.request.content.data?.couponId as string | undefined;
      if (couponId) {
        router.push(`/coupon/${couponId}`);
      }
    });
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup =
      segments[0] === "login" ||
      segments[0] === "signup" ||
      segments[0] === "confirm" ||
      segments[0] === "forgot-password" ||
      segments[0] === "reset-password" ||
      (segments[0] === "auth" && segments[1] === "callback");

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/");
    }
  }, [loading, isAuthenticated, segments]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const handleSignOut = () => {
    signOut();
    router.replace("/login");
  };

  return (
    <Stack>
      <Stack.Screen name="index" options={{
        headerTitle: () => (
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: "#000" }}>My Coupons</Text>
            {userEmail ? (
              <Text style={{ fontSize: 11, color: "#999" }} numberOfLines={1}>
                {userEmail}{authProvider === "google" ? " · Google" : ""}
              </Text>
            ) : null}
          </View>
        ),
        headerRight: () => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => router.push("/settings/notifications")} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Alerts</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ),
      }} />
      <Stack.Screen name="add" options={{ title: "Add Coupon" }} />
      <Stack.Screen name="coupon/[id]" options={{ title: "Coupon Detail" }} />
      <Stack.Screen name="coupon-edit/[id]" options={{ title: "Edit" }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="confirm" options={{ title: "Confirm Email" }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset Password" }} />
      <Stack.Screen name="reset-password" options={{ title: "Set New Password" }} />
      <Stack.Screen name="settings/notifications" options={{ title: "Notification Settings" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f7f8fa",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: "#666",
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerBtnText: {
    fontSize: 15,
    color: "#007AFF",
    fontWeight: "600",
  },
  signOutBtn: {
    marginRight: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  signOutText: {
    fontSize: 15,
    color: "#FF3B30",
    fontWeight: "600",
  },
});
