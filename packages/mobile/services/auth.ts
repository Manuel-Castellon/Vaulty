import { Linking } from "react-native";
import { Amplify } from "aws-amplify";
import { Hub, type KeyValueStorageInterface } from "aws-amplify/utils";
import {
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resendSignUpCode,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  resetPassword,
  confirmResetPassword,
  signInWithRedirect,
  fetchAuthSession,
} from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import * as SecureStore from "expo-secure-store";

// ── Secure token storage ──────────────────────────────────────────────────────
// Amplify v6 keeps tokens under the same keys amazon-cognito-identity-js used
// (CognitoIdentityServiceProvider.{clientId}.{username}.idToken, ...LastAuthUser,
// ...), so pointing it at SecureStore with the same key sanitizing keeps
// sessions from the old library signed in after the upgrade.

// SecureStore keys must match [a-zA-Z0-9._-]. Cognito uses dots which are fine.
// Replace any other special chars just in case.
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const SecureTokenStorage: KeyValueStorageInterface = {
  async setItem(key, value) {
    await SecureStore.setItemAsync(sanitizeKey(key), value);
  },
  async getItem(key) {
    try {
      return await SecureStore.getItemAsync(sanitizeKey(key));
    } catch (err) {
      // Amplify treats any read error as "no session", so log the real cause
      // (e.g. a Keystore key invalidated by a lock-screen change).
      console.error(`[auth] SecureStore read failed for ${key}:`, err);
      throw err;
    }
  },
  async removeItem(key) {
    await SecureStore.deleteItemAsync(sanitizeKey(key));
  },
  // SecureStore cannot enumerate keys. Amplify removes its keys one by one on
  // sign-out and never calls clear() for the token store; fail loudly if that
  // ever changes rather than leave tokens behind.
  async clear() {
    throw new Error("SecureTokenStorage.clear is unsupported");
  },
};

const MOBILE_REDIRECT_URI = "vaulty://auth/callback";
const MOBILE_SIGNOUT_URI = "vaulty://auth/signout";
const SIGN_OUT_TIMEOUT_MS = 10_000;
const CALLBACK_TIMEOUT_MS = 30_000;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID as string,
      userPoolClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID as string,
      loginWith: {
        oauth: {
          domain: process.env.EXPO_PUBLIC_COGNITO_DOMAIN as string,
          scopes: ["email", "openid", "profile"],
          redirectSignIn: [MOBILE_REDIRECT_URI],
          redirectSignOut: [MOBILE_SIGNOUT_URI],
          responseType: "code",
        },
      },
    },
  },
});
// Must come after configure: every Amplify.configure() call resets the token
// store to the default (AsyncStorage). Configure Amplify only here.
cognitoUserPoolsTokenProvider.setKeyValueStorage(SecureTokenStorage);

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// Callers branch on `err.code` (e.g. "UserNotConfirmedException"). Amplify puts
// the Cognito error name in `name`, so mirror it onto `code`.
function withCode(err: unknown): Error & { code?: string } {
  if (err instanceof Error) return Object.assign(err, { code: err.name });
  return new Error(String(err));
}

async function rethrowWithCode<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    throw withCode(err);
  }
}

export async function signUp(email: string, password: string): Promise<void> {
  await rethrowWithCode(
    amplifySignUp({ username: email, password, options: { userAttributes: { email } } })
  );
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await rethrowWithCode(amplifyConfirmSignUp({ username: email, confirmationCode: code }));
}

export async function resendConfirmationCode(email: string): Promise<void> {
  await rethrowWithCode(resendSignUpCode({ username: email }));
}

export async function signIn(email: string, password: string): Promise<void> {
  const result = await rethrowWithCode(amplifySignIn({ username: email, password }));
  if (result.isSignedIn) return;
  switch (result.nextStep.signInStep) {
    case "CONFIRM_SIGN_UP":
      throw Object.assign(new Error("User is not confirmed."), { code: "UserNotConfirmedException" });
    case "RESET_PASSWORD":
      throw Object.assign(new Error("You need to reset your password before signing in."), {
        code: "PasswordResetRequiredException",
      });
    default:
      throw new Error(`Sign-in needs an unsupported step: ${result.nextStep.signInStep}`);
  }
}

// Google users get a brief Custom Tab on Cognito's /logout. Resolves once local
// tokens are gone, even if that tab is dismissed or Amplify's revoke call
// stalls. Dismissing the tab can leave Cognito's hosted-UI cookie in Chrome, so
// the next Google sign-in may skip the account chooser.
export async function signOut(): Promise<void> {
  try {
    await withTimeout(amplifySignOut(), SIGN_OUT_TIMEOUT_MS, "Sign-out timed out");
  } catch (err) {
    console.error("[auth] Amplify sign-out did not complete:", err);
  }
  const store = cognitoUserPoolsTokenProvider.authTokenStore;
  if (await store.loadTokens()) {
    console.error("[auth] tokens survived sign-out; clearing them directly");
    await store.clearTokens();
  }
}

type IdToken = { token: string; payload: Record<string, unknown> };

// Fresh id token, refreshed when expired. null means signed out. Throws when a
// refresh fails for a transient reason (offline, Cognito 5xx); Amplify keeps the
// tokens then, so the user is still signed in.
async function getFreshIdToken(): Promise<IdToken | null> {
  try {
    const { tokens } = await fetchAuthSession();
    if (!tokens?.idToken) return null;
    return { token: tokens.idToken.toString(), payload: tokens.idToken.payload };
  } catch (err) {
    console.error("[auth] session refresh failed, tokens kept:", err);
    throw new Error("Couldn't refresh your session. Check your connection and try again.");
  }
}

// Identity only (who is signed in), so a stored but expired token is fine when
// it cannot be refreshed right now.
async function getIdentity(): Promise<IdToken | null> {
  try {
    return await getFreshIdToken();
  } catch {
    const stored = await cognitoUserPoolsTokenProvider.authTokenStore.loadTokens();
    if (!stored?.idToken) return null;
    return { token: stored.idToken.toString(), payload: stored.idToken.payload };
  }
}

export async function getIdToken(): Promise<string | null> {
  return (await getFreshIdToken())?.token ?? null;
}

export interface UserInfo {
  email: string | null;
  provider: "email" | "google";
}

export async function getCurrentUserInfo(): Promise<UserInfo> {
  const id = await getIdentity();
  if (!id) return { email: null, provider: "email" };
  const identities = id.payload.identities as Array<{ providerName: string }> | undefined;
  const provider = identities?.some((i) => i.providerName === "Google") ? "google" : "email";
  return { email: (id.payload.email as string | undefined) ?? null, provider };
}

export async function getCurrentUserId(): Promise<string | null> {
  return ((await getIdentity())?.payload.sub as string | undefined) ?? null;
}

// Fires when Amplify signs the user in or out on its own, e.g. a refresh token
// that was revoked or expired mid-session. Returns an unsubscribe function.
export function onAuthChange(callback: () => void): () => void {
  return Hub.listen("auth", ({ payload }) => {
    if (
      payload.event === "signedIn" ||
      payload.event === "signedOut" ||
      payload.event === "tokenRefresh_failure"
    ) {
      callback();
    }
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await rethrowWithCode(resetPassword({ username: email }));
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  await rethrowWithCode(
    confirmResetPassword({ username: email, confirmationCode: code, newPassword })
  );
}

// ── Google SSO ─────────────────────────────────────────────────────────────

export type GoogleSignInError = Error & {
  code?: string;
  // The redirect reached the app, so the auth/callback screen shows this error.
  shownByCallbackScreen?: boolean;
};

let pendingGoogleSignIn: Promise<void> | null = null;

// True when the user closed the Custom Tab without finishing.
export function isGoogleSignInCancel(err: unknown): boolean {
  return err instanceof Error && err.name === "OAuthSignInException" && /cancel/i.test(err.message);
}

async function runGoogleSignIn(): Promise<void> {
  // Registered before Amplify's own listener, so it sees the redirect first.
  let redirectArrived = false;
  const sub = Linking.addEventListener("url", ({ url }) => {
    if (url.startsWith(MOBILE_REDIRECT_URI)) redirectArrived = true;
  });
  try {
    // preferPrivateSession makes Amplify clear local tokens on sign-out even if
    // the logout tab is dismissed. Android Custom Tabs ignore it for sign-in.
    await signInWithRedirect({ provider: "Google", options: { preferPrivateSession: true } });
  } catch (err) {
    const e: GoogleSignInError = withCode(err);
    e.shownByCallbackScreen = redirectArrived;
    throw e;
  } finally {
    sub.remove();
  }
}

// Opens the hosted UI in a Custom Tab and resolves after Amplify has exchanged
// the code (with PKCE) and stored the tokens. A second call while one is in
// flight returns the same promise (a second Custom Tab would orphan the first).
export function signInWithGoogle(): Promise<void> {
  if (!pendingGoogleSignIn) {
    pendingGoogleSignIn = runGoogleSignIn().finally(() => {
      pendingGoogleSignIn = null;
    });
  }
  return pendingGoogleSignIn;
}

// Called by the auth/callback screen. On Android the redirect reaches the app
// as a deep link too, so that screen mounts while signInWithGoogle() is still
// exchanging the code; wait for it rather than exchanging the code twice.
export async function handleAuthCallback(): Promise<void> {
  if (pendingGoogleSignIn) {
    await withTimeout(
      pendingGoogleSignIn,
      CALLBACK_TIMEOUT_MS,
      "Sign-in is taking too long. Check your connection and try again."
    );
  } else if (!(await getIdToken())) {
    // Android can kill the app while the Custom Tab is open; the fresh process
    // has no exchange to finish and native Amplify does not pick up the code.
    console.error("[auth] Google redirect arrived with no sign-in in progress");
    throw new Error("Sign-in was interrupted. Tap Continue with Google again.");
  }
  if (!(await getIdToken())) throw new Error("Sign-in failed. Please try again.");
}
