/**
 * Tests for the mobile auth service — focused on:
 *  1. SecureCognitoStorage adapter (cache + SecureStore persistence)
 *  2. initSecureStorage cold-start rehydration
 *  3. Regression: every CognitoUser construction passes Storage (the bug
 *     that caused "user does not exist" + login-loop after adding SecureStore)
 */

import * as SecureStore from "expo-secure-store";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockAuthenticateUser = jest.fn();
const mockConfirmRegistration = jest.fn();
const mockResendConfirmationCode = jest.fn();
const mockForgotPassword = jest.fn();
const mockConfirmPassword = jest.fn();
const mockGetSession = jest.fn();
const mockCognitoSignOut = jest.fn();

const mockCurrentUser = {
  getSession: mockGetSession,
  signOut: mockCognitoSignOut,
};

const mockPool = {
  getCurrentUser: jest.fn().mockReturnValue(null),
  signUp: jest.fn(),
};

jest.mock("amazon-cognito-identity-js", () => ({
  CognitoUserPool: jest.fn().mockImplementation(() => mockPool),
  CognitoUser: jest.fn().mockImplementation(() => ({
    authenticateUser: mockAuthenticateUser,
    confirmRegistration: mockConfirmRegistration,
    resendConfirmationCode: mockResendConfirmationCode,
    forgotPassword: mockForgotPassword,
    confirmPassword: mockConfirmPassword,
    getSession: mockGetSession,
    signOut: mockCognitoSignOut,
  })),
  AuthenticationDetails: jest.fn(),
  CognitoUserAttribute: jest.fn(),
}));

import { CognitoUser } from "amazon-cognito-identity-js";
import {
  signIn,
  confirmSignUp,
  resendConfirmationCode,
  forgotPassword,
  confirmForgotPassword,
  initSecureStorage,
  __SecureCognitoStorageForTests as storage,
  __cognitoKeyPrefixForTests as KEY_PREFIX,
  __resetSecureCacheForTests,
} from "../services/auth";

const mockedSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const MockedCognitoUser = CognitoUser as jest.MockedClass<typeof CognitoUser>;

beforeEach(() => {
  jest.clearAllMocks();
  __resetSecureCacheForTests();
  mockedSecureStore.getItemAsync.mockResolvedValue(null);
  mockedSecureStore.setItemAsync.mockResolvedValue(undefined);
  mockedSecureStore.deleteItemAsync.mockResolvedValue(undefined);
});

// ── SecureCognitoStorage adapter ─────────────────────────────────────────────

describe("SecureCognitoStorage adapter", () => {
  it("setItem writes to in-memory cache", () => {
    storage.setItem("myKey", "myVal");
    expect(storage.getItem("myKey")).toBe("myVal");
  });

  it("setItem persists to SecureStore asynchronously", async () => {
    storage.setItem("someKey", "someVal");
    await Promise.resolve(); // flush microtasks
    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith("someKey", "someVal");
  });

  it("getItem returns null for keys that were never set", () => {
    expect(storage.getItem("nonexistent")).toBeNull();
  });

  it("removeItem clears from cache", () => {
    storage.setItem("removeMe", "val");
    storage.removeItem("removeMe");
    expect(storage.getItem("removeMe")).toBeNull();
  });

  it("removeItem calls SecureStore.deleteItemAsync", async () => {
    storage.setItem("removeMe", "val");
    storage.removeItem("removeMe");
    await Promise.resolve();
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith("removeMe");
  });

  it("clear empties the entire cache", () => {
    storage.setItem("a", "1");
    storage.setItem("b", "2");
    storage.clear();
    expect(storage.getItem("a")).toBeNull();
    expect(storage.getItem("b")).toBeNull();
  });

  it("sanitizes special characters in keys passed to SecureStore", async () => {
    storage.setItem("key with spaces!", "val");
    await Promise.resolve();
    // Spaces and ! are not in [a-zA-Z0-9._-], expect them replaced with _
    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith("key_with_spaces_", "val");
    // In-memory reads still use the original key
    expect(storage.getItem("key with spaces!")).toBe("val");
  });
});

// ── initSecureStorage ────────────────────────────────────────────────────────

describe("initSecureStorage", () => {
  it("does nothing when LastAuthUser is absent from SecureStore", async () => {
    mockedSecureStore.getItemAsync.mockResolvedValue(null);
    await initSecureStorage();
    expect(storage.getItem(`${KEY_PREFIX}.LastAuthUser`)).toBeNull();
  });

  it("loads LastAuthUser and all 5 token keys into cache when present", async () => {
    // Note: SecureStore keys are sanitized (@ → _), but cache keys use the original.
    // Use a plain username here to keep key equality simple; sanitization is
    // tested separately in the adapter suite above.
    const username = "testuser";
    const lastAuthKey = `${KEY_PREFIX}.LastAuthUser`;
    const secureStoreMap: Record<string, string> = {
      [lastAuthKey]: username,
      [`${KEY_PREFIX}.${username}.idToken`]: "id-token-value",
      [`${KEY_PREFIX}.${username}.accessToken`]: "access-token-value",
      [`${KEY_PREFIX}.${username}.refreshToken`]: "refresh-token-value",
      [`${KEY_PREFIX}.${username}.clockDrift`]: "0",
    };

    mockedSecureStore.getItemAsync.mockImplementation(async (key) => secureStoreMap[key] ?? null);

    await initSecureStorage();

    expect(storage.getItem(lastAuthKey)).toBe(username);
    expect(storage.getItem(`${KEY_PREFIX}.${username}.idToken`)).toBe("id-token-value");
    expect(storage.getItem(`${KEY_PREFIX}.${username}.accessToken`)).toBe("access-token-value");
    expect(storage.getItem(`${KEY_PREFIX}.${username}.refreshToken`)).toBe("refresh-token-value");
    expect(storage.getItem(`${KEY_PREFIX}.${username}.clockDrift`)).toBe("0");
  });

  it("only loads keys present in SecureStore (partial sessions)", async () => {
    const username = "partialuser";
    const lastAuthKey = `${KEY_PREFIX}.LastAuthUser`;

    mockedSecureStore.getItemAsync.mockImplementation(async (key) => {
      if (key === lastAuthKey) return username;
      if (key === `${KEY_PREFIX}.${username}.refreshToken`) return "refresh-only";
      return null;
    });

    await initSecureStorage();

    expect(storage.getItem(`${KEY_PREFIX}.${username}.refreshToken`)).toBe("refresh-only");
    expect(storage.getItem(`${KEY_PREFIX}.${username}.idToken`)).toBeNull();
  });
});

// ── Regression: CognitoUser always receives Storage ──────────────────────────
// This is the exact bug that caused "user does not exist" + login loop.
// The pool uses SecureCognitoStorage; CognitoUser must use the same storage
// or tokens written by authenticateUser are invisible to pool.getCurrentUser().

describe("CognitoUser storage consistency (regression)", () => {
  function assertStorageInjected() {
    expect(MockedCognitoUser).toHaveBeenCalled();
    const constructorArg = MockedCognitoUser.mock.calls[MockedCognitoUser.mock.calls.length - 1][0];
    expect(constructorArg).toHaveProperty("Storage");
    expect(constructorArg.Storage).toHaveProperty("getItem");
    expect(constructorArg.Storage).toHaveProperty("setItem");
    expect(constructorArg.Storage).toHaveProperty("removeItem");
    // Must be the same object as what the pool uses (identity check via setItem side-effect)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    constructorArg.Storage!.setItem("_probe", "1");
    expect(storage.getItem("_probe")).toBe("1");
    storage.removeItem("_probe");
  }

  it("signIn passes Storage to CognitoUser", () => {
    mockAuthenticateUser.mockImplementation((_auth: unknown, callbacks: { onSuccess: (s: unknown) => void }) =>
      callbacks.onSuccess({})
    );
    signIn("user@example.com", "pass");
    assertStorageInjected();
  });

  it("confirmSignUp passes Storage to CognitoUser", () => {
    mockConfirmRegistration.mockImplementation((_code: unknown, _force: unknown, cb: (err: null) => void) => cb(null));
    confirmSignUp("user@example.com", "123456");
    assertStorageInjected();
  });

  it("resendConfirmationCode passes Storage to CognitoUser", () => {
    mockResendConfirmationCode.mockImplementation((cb: (err: null) => void) => cb(null));
    resendConfirmationCode("user@example.com");
    assertStorageInjected();
  });

  it("forgotPassword passes Storage to CognitoUser", () => {
    mockForgotPassword.mockImplementation((callbacks: { onSuccess: () => void }) => callbacks.onSuccess());
    forgotPassword("user@example.com");
    assertStorageInjected();
  });

  it("confirmForgotPassword passes Storage to CognitoUser", () => {
    mockConfirmPassword.mockImplementation((_code: unknown, _pw: unknown, callbacks: { onSuccess: () => void }) =>
      callbacks.onSuccess()
    );
    confirmForgotPassword("user@example.com", "123456", "newPass1!");
    assertStorageInjected();
  });
});

// ── Error propagation ─────────────────────────────────────────────────────────

describe("signIn error propagation", () => {
  it("rejects with the original Cognito error (no message transformation)", async () => {
    const cognitoErr = { code: "NotAuthorizedException", message: "Incorrect username or password." };
    mockAuthenticateUser.mockImplementation((_auth: unknown, callbacks: { onFailure: (e: typeof cognitoErr) => void }) =>
      callbacks.onFailure(cognitoErr)
    );
    await expect(signIn("user@example.com", "wrongpass")).rejects.toEqual(cognitoErr);
  });

  it("rejects with UserNotFoundException as-is (no masking)", async () => {
    const cognitoErr = { code: "UserNotFoundException", message: "User does not exist." };
    mockAuthenticateUser.mockImplementation((_auth: unknown, callbacks: { onFailure: (e: typeof cognitoErr) => void }) =>
      callbacks.onFailure(cognitoErr)
    );
    await expect(signIn("nobody@example.com", "pass")).rejects.toEqual(cognitoErr);
  });
});
