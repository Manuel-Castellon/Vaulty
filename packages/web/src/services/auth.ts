import { Amplify } from "aws-amplify";
import { Hub } from "aws-amplify/utils";
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

const CALLBACK_PATH = "/auth/callback";
const SIGN_OUT_TIMEOUT_MS = 10_000;
const CALLBACK_TIMEOUT_MS = 30_000;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN as string, // e.g. vaulty-dev-123456789.auth.us-east-1.amazoncognito.com
          scopes: ["email", "openid", "profile"],
          redirectSignIn: [`${window.location.origin}${CALLBACK_PATH}`],
          redirectSignOut: [`${window.location.origin}/`],
          responseType: "code",
        },
      },
    },
  },
});

// Google id_token written by the pre-Amplify hand-rolled OAuth flow. Amplify now
// owns federated sessions, so the old key is dead; those users sign in once more.
localStorage.removeItem("vaulty_id_token");

// Amplify completes the Google redirect on its own when the callback page loads
// and reports the outcome only through Hub. This listener is attached before
// that async work can finish, so the outcome is never missed.
const redirectOutcome = new Promise<void>((resolve, reject) => {
  Hub.listen("auth", ({ payload }) => {
    if (payload.event === "signInWithRedirect") resolve();
    if (payload.event === "signInWithRedirect_failure") {
      reject(new Error(payload.data?.error?.message ?? "Sign-in failed"));
    }
  });
});
redirectOutcome.catch(() => {}); // only handleAuthCallback reports it

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

// ── Email/password auth ────────────────────────────────────────────────────

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

// Google users are sent through Cognito's /logout and land back on "/".
// Resolves once local tokens are gone, even if Amplify's revoke call stalls.
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

// Navigates away to the Cognito hosted UI (code flow with PKCE).
export async function signInWithGoogle(): Promise<void> {
  await rethrowWithCode(signInWithRedirect({ provider: "Google" }));
}

// Called by AuthCallbackPage. Amplify exchanges the code itself. fetchAuthSession
// waits for that, but only within 5 minutes of the click, so for slow hosted-UI
// visits wait for the Hub outcome as well.
export async function handleAuthCallback(): Promise<void> {
  const session = await fetchAuthSession();
  if (session.tokens?.idToken) return;
  await withTimeout(
    redirectOutcome,
    CALLBACK_TIMEOUT_MS,
    "Sign-in is taking too long. Check your connection and try again."
  );
  const after = await fetchAuthSession();
  if (!after.tokens?.idToken) throw new Error("Sign-in failed");
}

// ── Token/session helpers ──────────────────────────────────────────────────

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
