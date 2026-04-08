import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "My Coupons" }} />
      <Stack.Screen name="add" options={{ title: "Add Coupon" }} />
      <Stack.Screen name="coupon/[id]" options={{ title: "Coupon Detail" }} />
    </Stack>
  );
}
