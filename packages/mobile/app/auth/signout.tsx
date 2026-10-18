import { Redirect } from "expo-router";

// Landing route for Cognito's /logout redirect (vaulty://auth/signout) after a
// Google user signs out.
export default function AuthSignOutScreen() {
  return <Redirect href="/login" />;
}
