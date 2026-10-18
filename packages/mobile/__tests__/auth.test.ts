/**
 * Tests for the mobile auth service — focused on:
 *  1. SecureTokenStorage adapter over expo-secure-store
 *  2. Amplify wiring (hosted UI redirect URIs, token store)
 *  3. Session helpers: refresh failures vs. signed out
 *  4. Error mapping onto err.code, which the screens branch on
 *  5. Sign-out always clearing local tokens
 *  6. Google SSO: in-flight dedupe, callback wait and timeouts
 */

import { Linking } from "react-native";
import * as SecureStore from "expo-secure-store";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// The service configures Amplify at import time, before this file's own
// top-level consts exist, so the factories build their own jest.fn()s and the
// tests reach them through jest.requireMock below.
jest.mock("aws-amplify", () => ({ Amplify: { configure: jest.fn() } }));
jest.mock("aws-amplify/utils", () => {
  const listeners: Array<(e: { payload: { event: string } }) => void> = [];
  return {
    __listeners: listeners,
    Hub: {
      listen: jest.fn((_channel: string, cb: (e: { payload: { event: string } }) => void) => {
        listeners.push(cb);
        return () => listeners.splice(listeners.indexOf(cb), 1);
      }),
    },
  };
});
jest.mock("aws-amplify/auth/cognito", () => ({
  cognitoUserPoolsTokenProvider: {
    setKeyValueStorage: jest.fn(),
    authTokenStore: { loadTokens: jest.fn(), clearTokens: jest.fn() },
  },
}));
jest.mock("aws-amplify/auth", () => ({
  signUp: jest.fn(),
  confirmSignUp: jest.fn(),
  resendSignUpCode: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  resetPassword: jest.fn(),
  confirmResetPassword: jest.fn(),
  signInWithRedirect: jest.fn(),
  fetchAuthSession: jest.fn(),
}));

import {
  SecureTokenStorage as storage,
  signUp,
  signIn,
  signOut,
  signInWithGoogle,
  handleAuthCallback,
  isGoogleSignInCancel,
  getIdToken,
  getCurrentUserId,
  getCurrentUserInfo,
  onAuthChange,
  type GoogleSignInError,
} from "../services/auth";

const mockedSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const mockConfigure: jest.Mock = jest.requireMock("aws-amplify").Amplify.configure;
const tokenProvider = jest.requireMock("aws-amplify/auth/cognito").cognitoUserPoolsTokenProvider;
const mockSetKeyValueStorage: jest.Mock = tokenProvider.setKeyValueStorage;
const mockLoadTokens: jest.Mock = tokenProvider.authTokenStore.loadTokens;
const mockClearTokens: jest.Mock = tokenProvider.authTokenStore.clearTokens;
const hubListeners: Array<(e: { payload: { event: string } }) => void> =
  jest.requireMock("aws-amplify/utils").__listeners;
const amplifyAuth = jest.requireMock("aws-amplify/auth");
const mockAmplifySignUp: jest.Mock = amplifyAuth.signUp;
const mockAmplifySignIn: jest.Mock = amplifyAuth.signIn;
const mockAmplifySignOut: jest.Mock = amplifyAuth.signOut;
const mockSignInWithRedirect: jest.Mock = amplifyAuth.signInWithRedirect;
const mockFetchAuthSession: jest.Mock = amplifyAuth.fetchAuthSession;

// Captured before beforeEach clears mock history.
const amplifyConfig = mockConfigure.mock.calls[0]?.[0];
const tokenStorage = mockSetKeyValueStorage.mock.calls[0]?.[0];
const storageSetAfterConfigure =
  mockSetKeyValueStorage.mock.invocationCallOrder[0] > mockConfigure.mock.invocationCallOrder[0];

const KEY_PREFIX = "CognitoIdentityServiceProvider.test-client-id";

function namedError(name: string, message = name): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

function idToken(payload: Record<string, unknown>, jwt = "header.body.sig") {
  return { toString: () => jwt, payload };
}

function sessionWith(payload: Record<string, unknown>, jwt?: string) {
  return { tokens: { idToken: idToken(payload, jwt) } };
}

// Captures the Linking "url" listener the service registers during Google sign-in.
let urlListener: ((e: { url: string }) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockedSecureStore.getItemAsync.mockResolvedValue(null);
  mockedSecureStore.setItemAsync.mockResolvedValue(undefined);
  mockLoadTokens.mockResolvedValue(null);
  urlListener = null;
  jest.spyOn(Linking, "addEventListener").mockImplementation(((_type: string, cb: (e: { url: string }) => void) => {
    urlListener = cb;
    return { remove: jest.fn() };
  }) as unknown as typeof Linking.addEventListener);
});

// ── Amplify wiring ───────────────────────────────────────────────────────────

describe("Amplify configuration", () => {
  it("uses the app scheme for hosted UI sign-in and sign-out redirects", () => {
    // Pool/client/domain come from EXPO_PUBLIC_* vars, which babel-preset-expo
    // inlines at transform time, so they are not asserted here.
    expect(amplifyConfig.Auth.Cognito.loginWith.oauth).toMatchObject({
      scopes: ["email", "openid", "profile"],
      redirectSignIn: ["vaulty://auth/callback"],
      redirectSignOut: ["vaulty://auth/signout"],
      responseType: "code",
    });
  });

  it("stores tokens in SecureStore, set after configure (configure resets it)", () => {
    expect(tokenStorage).toBe(storage);
    expect(storageSetAfterConfigure).toBe(true);
  });
});

// ── SecureTokenStorage ───────────────────────────────────────────────────────

describe("SecureTokenStorage", () => {
  it("returns null for keys that were never set", async () => {
    expect(await storage.getItem("nonexistent")).toBeNull();
  });

  it("setItem and removeItem go straight to SecureStore", async () => {
    await storage.setItem(`${KEY_PREFIX}.abc-sub.idToken`, "id-token");
    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(`${KEY_PREFIX}.abc-sub.idToken`, "id-token");
    await storage.removeItem(`${KEY_PREFIX}.abc-sub.idToken`);
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith(`${KEY_PREFIX}.abc-sub.idToken`);
  });

  it("sanitizes characters SecureStore rejects, the same way the old adapter did", async () => {
    await storage.setItem("key with spaces!", "val");
    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith("key_with_spaces_", "val");
    await storage.getItem("key with spaces!");
    expect(mockedSecureStore.getItemAsync).toHaveBeenCalledWith("key_with_spaces_");
  });

  it("surfaces SecureStore write failures to Amplify instead of hiding them", async () => {
    mockedSecureStore.setItemAsync.mockRejectedValueOnce(new Error("keystore unavailable"));
    await expect(storage.setItem("k", "v")).rejects.toThrow("keystore unavailable");
  });

  it("logs read failures before rethrowing (Amplify would treat them as no session)", async () => {
    mockedSecureStore.getItemAsync.mockRejectedValueOnce(new Error("key invalidated"));
    await expect(storage.getItem("k")).rejects.toThrow("key invalidated");
    expect(console.error).toHaveBeenCalled();
  });

  it("clear() fails loudly because SecureStore cannot enumerate keys", async () => {
    await expect(storage.clear()).rejects.toThrow(/unsupported/);
  });
});

// ── Session helpers ──────────────────────────────────────────────────────────

describe("getIdToken / getCurrentUserId / getCurrentUserInfo", () => {
  it("returns the id token from the Amplify session", async () => {
    mockFetchAuthSession.mockResolvedValue(sessionWith({ sub: "u1" }, "the.jwt.value"));
    expect(await getIdToken()).toBe("the.jwt.value");
  });

  it("returns null when signed out", async () => {
    mockFetchAuthSession.mockResolvedValue({ tokens: undefined });
    expect(await getIdToken()).toBeNull();
    expect(await getCurrentUserId()).toBeNull();
  });

  it("getIdToken throws a connection error when refresh fails, instead of sending no token", async () => {
    mockFetchAuthSession.mockRejectedValue(new TypeError("Network request failed"));
    await expect(getIdToken()).rejects.toThrow(/couldn't refresh your session/i);
  });

  it("keeps an offline user identified from stored tokens", async () => {
    mockFetchAuthSession.mockRejectedValue(new TypeError("Network request failed"));
    mockLoadTokens.mockResolvedValue({ idToken: idToken({ sub: "offline-user", email: "a@b.com" }) });
    expect(await getCurrentUserId()).toBe("offline-user");
    expect(await getCurrentUserInfo()).toEqual({ email: "a@b.com", provider: "email" });
  });

  it("reports Google as provider for federated users", async () => {
    mockFetchAuthSession.mockResolvedValue(
      sessionWith({ sub: "u1", email: "a@b.com", identities: [{ providerName: "Google" }] })
    );
    expect(await getCurrentUserInfo()).toEqual({ email: "a@b.com", provider: "google" });
  });
});

describe("onAuthChange", () => {
  it("fires when Amplify ends or starts a session, not on unrelated events", () => {
    const cb = jest.fn();
    const stop = onAuthChange(cb);
    const emit = (event: string) => [...hubListeners].forEach((l) => l({ payload: { event } }));
    emit("tokenRefresh");
    emit("tokenRefresh_failure");
    emit("signedIn");
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
    emit("signedOut");
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

// ── Email/password ───────────────────────────────────────────────────────────

describe("signUp", () => {
  it("uses the email as username and email attribute", async () => {
    mockAmplifySignUp.mockResolvedValue({});
    await signUp("a@b.com", "Passw0rd");
    expect(mockAmplifySignUp).toHaveBeenCalledWith({
      username: "a@b.com",
      password: "Passw0rd",
      options: { userAttributes: { email: "a@b.com" } },
    });
  });
});

describe("signIn", () => {
  it("resolves when Amplify reports the user signed in", async () => {
    mockAmplifySignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: "DONE" } });
    await expect(signIn("a@b.com", "pw")).resolves.toBeUndefined();
  });

  it("throws UserNotConfirmedException so login can route to /confirm", async () => {
    mockAmplifySignIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "CONFIRM_SIGN_UP" } });
    await expect(signIn("a@b.com", "pw")).rejects.toMatchObject({ code: "UserNotConfirmedException" });
  });

  it("throws PasswordResetRequiredException so login can route to forgot-password", async () => {
    mockAmplifySignIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "RESET_PASSWORD" } });
    await expect(signIn("a@b.com", "pw")).rejects.toMatchObject({ code: "PasswordResetRequiredException" });
  });

  it("keeps the Cognito message and exposes the error name as err.code", async () => {
    mockAmplifySignIn.mockRejectedValue(namedError("NotAuthorizedException", "Incorrect username or password."));
    await expect(signIn("a@b.com", "wrongpass")).rejects.toMatchObject({
      code: "NotAuthorizedException",
      message: "Incorrect username or password.",
    });
  });
});

// ── Sign-out ─────────────────────────────────────────────────────────────────

describe("signOut", () => {
  it("delegates to Amplify and leaves storage alone when it cleared the tokens", async () => {
    mockAmplifySignOut.mockResolvedValue(undefined);
    await signOut();
    expect(mockAmplifySignOut).toHaveBeenCalledTimes(1);
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it("clears tokens directly when Amplify's sign-out stalls (revoke call, open logout tab)", async () => {
    jest.useFakeTimers();
    mockAmplifySignOut.mockReturnValue(new Promise(() => {}));
    mockLoadTokens.mockResolvedValue({ idToken: idToken({ sub: "u1" }) });
    const done = signOut();
    await jest.advanceTimersByTimeAsync(10_000);
    await done;
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
  });

  it("clears tokens directly when the logout tab reports an error", async () => {
    mockAmplifySignOut.mockRejectedValue(namedError("OAuthSignOutException"));
    mockLoadTokens.mockResolvedValue({ idToken: idToken({ sub: "u1" }) });
    await signOut();
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
  });
});

// ── Google SSO ───────────────────────────────────────────────────────────────

describe("Google SSO", () => {
  it("passes preferPrivateSession so sign-out clears local tokens even if the logout tab is dismissed", async () => {
    mockSignInWithRedirect.mockResolvedValue(undefined);
    await signInWithGoogle();
    expect(mockSignInWithRedirect).toHaveBeenCalledWith({
      provider: "Google",
      options: { preferPrivateSession: true },
    });
  });

  it("a second tap while a sign-in is open reuses it instead of opening another tab", async () => {
    let finish!: () => void;
    mockSignInWithRedirect.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const first = signInWithGoogle();
    const second = signInWithGoogle();
    expect(second).toBe(first);
    expect(mockSignInWithRedirect).toHaveBeenCalledTimes(1);
    finish();
    await first;
  });

  it("recognizes a closed tab as a cancel", () => {
    expect(isGoogleSignInCancel(namedError("OAuthSignInException", "canceled"))).toBe(true);
    expect(isGoogleSignInCancel(namedError("OAuthSignInException", "invalid_grant"))).toBe(false);
  });

  it("marks errors that happen after the redirect reached the app as shown by the callback screen", async () => {
    mockSignInWithRedirect.mockImplementation(async () => {
      urlListener?.({ url: "vaulty://auth/callback?code=abc&state=xyz" });
      throw namedError("OAuthSignInException", "invalid_grant");
    });
    const err: GoogleSignInError = await signInWithGoogle().catch((e) => e);
    expect(err.shownByCallbackScreen).toBe(true);
  });

  it("does not mark errors from before the redirect (the login screen shows those)", async () => {
    mockSignInWithRedirect.mockRejectedValue(new Error("No eligible browser found on device"));
    const err: GoogleSignInError = await signInWithGoogle().catch((e) => e);
    expect(err.shownByCallbackScreen).toBe(false);
  });

  it("handleAuthCallback waits for the in-flight exchange before checking the session", async () => {
    let finishExchange!: () => void;
    mockSignInWithRedirect.mockReturnValue(new Promise<void>((r) => (finishExchange = r)));
    mockFetchAuthSession.mockResolvedValue(sessionWith({ sub: "u1" }));

    signInWithGoogle();
    let settled = false;
    const callback = handleAuthCallback().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mockFetchAuthSession).not.toHaveBeenCalled();

    finishExchange();
    await callback;
    expect(settled).toBe(true);
  });

  it("handleAuthCallback rejects with the exchange error", async () => {
    mockSignInWithRedirect.mockRejectedValue(new Error("invalid_grant"));
    signInWithGoogle().catch(() => {});
    await expect(handleAuthCallback()).rejects.toThrow("invalid_grant");
  });

  it("handleAuthCallback explains an interrupted sign-in when the app was restarted mid-flow", async () => {
    mockFetchAuthSession.mockResolvedValue({ tokens: undefined });
    await expect(handleAuthCallback()).rejects.toThrow(/interrupted/i);
  });

  // Last: leaves a sign-in that never settles.
  it("handleAuthCallback times out instead of spinning on a stalled token request", async () => {
    jest.useFakeTimers();
    mockSignInWithRedirect.mockReturnValue(new Promise(() => {}));
    signInWithGoogle();
    const assertion = expect(handleAuthCallback()).rejects.toThrow(/taking too long/i);
    await jest.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});
