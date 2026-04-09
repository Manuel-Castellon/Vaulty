import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import { getIdToken, signOut } from "../services/auth";
import { api } from "../services/api";

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
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await api.pushTokens.register({ token: tokenData.data });
  } catch (err) {
    // Non-fatal — notifications just won't work until next launch
    console.warn("[push] Failed to register push token:", err);
  }
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    getIdToken().then((token) => {
      const authed = !!token;
      setIsAuthenticated(authed);
      setAuthChecked(true);
      if (authed) registerForPushNotifications();
    });
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    const inAuthGroup =
      segments[0] === "login" ||
      segments[0] === "signup" ||
      segments[0] === "confirm" ||
      (segments[0] === "auth" && segments[1] === "callback");

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/");
    }
  }, [authChecked, isAuthenticated, segments]);

  if (!authChecked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const handleSignOut = () => {
    signOut();
    setIsAuthenticated(false);
    router.replace("/login");
  };

  return (
    <Stack>
      <Stack.Screen name="index" options={{
        title: "My Coupons",
        headerRight: () => (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        ),
      }} />
      <Stack.Screen name="add" options={{ title: "Add Coupon" }} />
      <Stack.Screen name="coupon/[id]" options={{ title: "Coupon Detail" }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="confirm" options={{ title: "Confirm Email" }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
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
