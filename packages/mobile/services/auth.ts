import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import * as SecureStore from "expo-secure-store";

// ── Secure token storage ──────────────────────────────────────────────────────
// amazon-cognito-identity-js requires a synchronous Storage interface (like
// localStorage). expo-secure-store is async, so we maintain a memory cache for
// synchronous reads and persist to SecureStore in the background.
//
// On cold start, call initSecureStorage() to rehydrate the cache from
// SecureStore so existing sessions survive app restarts.

const _secureCache = new Map<string, string>();

// SecureStore keys must match [a-zA-Z0-9._-]. Cognito uses dots which are fine.
// Replace any other special chars just in case.
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const SecureCognitoStorage = {
  setItem(key: string, value: string): void {
    _secureCache.set(key, value);
    SecureStore.setItemAsync(sanitizeKey(key), value).catch(() => {
      // Non-fatal: token remains in memory for this session
    });
  },
  getItem(key: string): string | null {
    return _secureCache.get(key) ?? null;
  },
  removeItem(key: string): void {
    _secureCache.delete(key);
    SecureStore.deleteItemAsync(sanitizeKey(key)).catch(() => {});
  },
  clear(): void {
    _secureCache.clear();
  },
};

const CLIENT_ID_FOR_INIT = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID as string;

// Known Cognito key suffixes for a logged-in user:
//   CognitoIdentityServiceProvider.{clientId}.LastAuthUser
//   CognitoIdentityServiceProvider.{clientId}.{username}.idToken
//   CognitoIdentityServiceProvider.{clientId}.{username}.accessToken
//   CognitoIdentityServiceProvider.{clientId}.{username}.refreshToken
//   CognitoIdentityServiceProvider.{clientId}.{username}.clockDrift
export async function initSecureStorage(): Promise<void> {
  const prefix = `CognitoIdentityServiceProvider.${CLIENT_ID_FOR_INIT}`;
  const lastAuthKey = `${prefix}.LastAuthUser`;
  const sanitized = sanitizeKey(lastAuthKey);
  const lastAuthUser = await SecureStore.getItemAsync(sanitized);
  if (!lastAuthUser) return;
  _secureCache.set(lastAuthKey, lastAuthUser);

  const userKeys = ["idToken", "accessToken", "refreshToken", "clockDrift"];
  await Promise.all(
    userKeys.map(async (suffix) => {
      const k = `${prefix}.${lastAuthUser}.${suffix}`;
      const v = await SecureStore.getItemAsync(sanitizeKey(k));
      if (v != null) _secureCache.set(k, v);
    })
  );
}

const pool = new CognitoUserPool({
  UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID as string,
  ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID as string,
  Storage: SecureCognitoStorage,
});

const COGNITO_DOMAIN = process.env.EXPO_PUBLIC_COGNITO_DOMAIN as string;
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID as string;
const MOBILE_REDIRECT_URI = "vaulty://auth/callback";

// In-memory store for Google SSO federated id_token (session-scoped).
// This is intentionally not persisted across app restarts — the user
// will re-auth via the _layout guard when they reopen the app cold.
let _federatedIdToken: string | null = null;

function getStoredFederatedToken(): string | null {
  if (!_federatedIdToken) return null;
  try {
    const payload = JSON.parse(atob(_federatedIdToken.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) {
      _federatedIdToken = null;
      return null;
    }
    return _federatedIdToken;
  } catch {
    return null;
  }
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const attrs = [new CognitoUserAttribute({ Name: "email", Value: email })];
    pool.signUp(email, password, attrs, [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.confirmRegistration(code, true, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.resendConfirmationCode((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    const auth = new AuthenticationDetails({ Username: email, Password: password });
    user.authenticateUser(auth, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

export function signOut(): void {
  pool.getCurrentUser()?.signOut();
  _federatedIdToken = null;
}

export function getIdToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = pool.getCurrentUser();
    if (user) {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (!err && session?.isValid()) {
          return resolve(session.getIdToken().getJwtToken());
        }
        resolve(getStoredFederatedToken());
      });
    } else {
      resolve(getStoredFederatedToken());
    }
  });
}

export function getCurrentUserId(): Promise<string | null> {
  return new Promise((resolve) => {
    const user = pool.getCurrentUser();
    if (user) {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (!err && session?.isValid()) {
          return resolve(session.getIdToken().payload.sub ?? null);
        }
        const token = getStoredFederatedToken();
        if (!token) return resolve(null);
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          resolve(payload.sub ?? null);
        } catch {
          resolve(null);
        }
      });
    } else {
      const token = getStoredFederatedToken();
      if (!token) return resolve(null);
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        resolve(payload.sub ?? null);
      } catch {
        resolve(null);
      }
    }
  });
}

export function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

export function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool });
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

// ── Google SSO ─────────────────────────────────────────────────────────────

export function getGoogleSignInUrl(): string {
  const redirectUri = encodeURIComponent(MOBILE_REDIRECT_URI);
  return (
    `https://${COGNITO_DOMAIN}/oauth2/authorize` +
    `?identity_provider=Google` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&scope=email+openid+profile`
  );
}

// Called by auth/callback screen after Cognito redirects back with ?code=...
export async function handleAuthCallback(code: string): Promise<void> {
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: MOBILE_REDIRECT_URI,
    }).toString(),
  });

  if (!res.ok) throw new Error("Token exchange failed");

  const data = await res.json();
  if (!data.id_token) throw new Error("No id_token in response");

  _federatedIdToken = data.id_token as string;
}
