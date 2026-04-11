import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";

const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN as string; // e.g. vaulty-dev-123456789.auth.us-east-1.amazoncognito.com

const pool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
  ClientId: CLIENT_ID,
});

// ── Email/password auth ────────────────────────────────────────────────────

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
  localStorage.removeItem("vaulty_id_token");
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
  const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback`);
  return (
    `https://${COGNITO_DOMAIN}/oauth2/authorize` +
    `?identity_provider=Google` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&client_id=${CLIENT_ID}` +
    `&scope=email+openid+profile`
  );
}

// Called by AuthCallbackPage after Cognito redirects back with ?code=...
export async function handleAuthCallback(code: string): Promise<void> {
  const redirectUri = `${window.location.origin}/auth/callback`;
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status})${body ? `: ${body}` : ""}`);
  }

  const { id_token } = await res.json();
  localStorage.setItem("vaulty_id_token", id_token);
}

// ── Token/session helpers ──────────────────────────────────────────────────

function getStoredFederatedToken(): string | null {
  const token = localStorage.getItem("vaulty_id_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("vaulty_id_token");
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function getIdToken(): Promise<string | null> {
  return new Promise((resolve) => {
    // Check email/password session first
    const user = pool.getCurrentUser();
    if (user) {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (!err && session?.isValid()) return resolve(session.getIdToken().getJwtToken());
        // Fall through to federated token
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
        if (!err && session?.isValid()) return resolve(session.getIdToken().payload.sub ?? null);
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
