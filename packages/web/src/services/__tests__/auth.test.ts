import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type HubListener = (e: { payload: { event: string; data?: unknown } }) => void;

// vi.mock factories are hoisted, so shared mocks must be hoisted too. The legacy
// key is set here, before ../auth loads, so its cleanup on load can be observed.
const mocks = vi.hoisted(() => {
  localStorage.setItem("vaulty_id_token", "legacy-token");
  return {
    configure: vi.fn(),
    hubListeners: [] as HubListener[],
    signUp: vi.fn(),
    confirmSignUp: vi.fn(),
    resendSignUpCode: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    confirmResetPassword: vi.fn(),
    signInWithRedirect: vi.fn(),
    fetchAuthSession: vi.fn(),
    loadTokens: vi.fn(),
    clearTokens: vi.fn(),
  };
});

vi.mock("aws-amplify", () => ({ Amplify: { configure: mocks.configure } }));
vi.mock("aws-amplify/utils", () => ({
  Hub: {
    listen: (_channel: string, cb: HubListener) => {
      mocks.hubListeners.push(cb);
      return () => mocks.hubListeners.splice(mocks.hubListeners.indexOf(cb), 1);
    },
  },
}));
vi.mock("aws-amplify/auth/cognito", () => ({
  cognitoUserPoolsTokenProvider: {
    authTokenStore: { loadTokens: mocks.loadTokens, clearTokens: mocks.clearTokens },
  },
}));
vi.mock("aws-amplify/auth", () => ({
  signUp: mocks.signUp,
  confirmSignUp: mocks.confirmSignUp,
  resendSignUpCode: mocks.resendSignUpCode,
  signIn: mocks.signIn,
  signOut: mocks.signOut,
  resetPassword: mocks.resetPassword,
  confirmResetPassword: mocks.confirmResetPassword,
  signInWithRedirect: mocks.signInWithRedirect,
  fetchAuthSession: mocks.fetchAuthSession,
}));

import {
  signUp,
  signIn,
  signOut,
  signInWithGoogle,
  handleAuthCallback,
  getIdToken,
  getCurrentUserId,
  getCurrentUserInfo,
  onAuthChange,
} from "../auth";

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

function emitHub(event: string, data?: unknown) {
  for (const listener of [...mocks.hubListeners]) listener({ payload: { event, data } });
}

// Captured before beforeEach clears mock history.
const amplifyConfig = mocks.configure.mock.calls[0]?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.loadTokens.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("module setup", () => {
  it("configures Amplify with the Cognito pool and the hosted UI on this origin", () => {
    const oauth = amplifyConfig.Auth.Cognito.loginWith.oauth;
    expect(oauth.responseType).toBe("code");
    expect(oauth.scopes).toEqual(["email", "openid", "profile"]);
    expect(oauth.redirectSignIn).toEqual([`${window.location.origin}/auth/callback`]);
    expect(oauth.redirectSignOut).toEqual([`${window.location.origin}/`]);
  });

  it("removes the id_token left by the pre-Amplify Google flow", () => {
    expect(localStorage.getItem("vaulty_id_token")).toBeNull();
  });
});

describe("getIdToken / getCurrentUserId / getCurrentUserInfo", () => {
  it("returns the id token from the Amplify session", async () => {
    mocks.fetchAuthSession.mockResolvedValue(sessionWith({ sub: "u1" }, "the.jwt.value"));
    expect(await getIdToken()).toBe("the.jwt.value");
  });

  it("returns null when there is no session", async () => {
    mocks.fetchAuthSession.mockResolvedValue({ tokens: undefined });
    expect(await getIdToken()).toBeNull();
    expect(await getCurrentUserId()).toBeNull();
  });

  it("getIdToken throws a connection error when refresh fails, instead of sending no token", async () => {
    mocks.fetchAuthSession.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getIdToken()).rejects.toThrow(/couldn't refresh your session/i);
  });

  it("keeps the user identified from stored tokens while a refresh cannot run", async () => {
    mocks.fetchAuthSession.mockRejectedValue(new TypeError("Failed to fetch"));
    mocks.loadTokens.mockResolvedValue({ idToken: idToken({ sub: "offline-user", email: "a@b.com" }) });
    expect(await getCurrentUserId()).toBe("offline-user");
    expect(await getCurrentUserInfo()).toEqual({ email: "a@b.com", provider: "email" });
  });

  it("returns sub as the user id", async () => {
    mocks.fetchAuthSession.mockResolvedValue(sessionWith({ sub: "cognito-user-999" }));
    expect(await getCurrentUserId()).toBe("cognito-user-999");
  });

  it("reports Google as provider for federated users", async () => {
    mocks.fetchAuthSession.mockResolvedValue(
      sessionWith({ sub: "u1", email: "a@b.com", identities: [{ providerName: "Google" }] })
    );
    expect(await getCurrentUserInfo()).toEqual({ email: "a@b.com", provider: "google" });
  });

  it("reports email as provider for password users and ignores unknown claims", async () => {
    mocks.fetchAuthSession.mockResolvedValue(
      sessionWith({ sub: "u1", email: "a@b.com", some_new_claim: { nested: true } })
    );
    expect(await getCurrentUserInfo()).toEqual({ email: "a@b.com", provider: "email" });
  });
});

describe("signUp", () => {
  it("uses the email as username and email attribute", async () => {
    mocks.signUp.mockResolvedValue({});
    await signUp("a@b.com", "Passw0rd");
    expect(mocks.signUp).toHaveBeenCalledWith({
      username: "a@b.com",
      password: "Passw0rd",
      options: { userAttributes: { email: "a@b.com" } },
    });
  });

  it("exposes the Cognito error name as err.code", async () => {
    mocks.signUp.mockRejectedValue(namedError("UsernameExistsException", "User already exists"));
    await expect(signUp("a@b.com", "x")).rejects.toMatchObject({
      code: "UsernameExistsException",
      message: "User already exists",
    });
  });
});

describe("signIn", () => {
  it("resolves when Amplify reports the user signed in", async () => {
    mocks.signIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: "DONE" } });
    await expect(signIn("a@b.com", "pw")).resolves.toBeUndefined();
    expect(mocks.signIn).toHaveBeenCalledWith({ username: "a@b.com", password: "pw" });
  });

  it("throws UserNotConfirmedException when Cognito wants sign-up confirmation", async () => {
    mocks.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "CONFIRM_SIGN_UP" } });
    await expect(signIn("a@b.com", "pw")).rejects.toMatchObject({ code: "UserNotConfirmedException" });
  });

  it("throws PasswordResetRequiredException so login can route to forgot-password", async () => {
    mocks.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "RESET_PASSWORD" } });
    await expect(signIn("a@b.com", "pw")).rejects.toMatchObject({ code: "PasswordResetRequiredException" });
  });

  it("throws on any other next step instead of pretending to be signed in", async () => {
    mocks.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
    });
    await expect(signIn("a@b.com", "pw")).rejects.toThrow("NEW_PASSWORD_REQUIRED");
  });

  it("maps wrong-password errors to err.code", async () => {
    mocks.signIn.mockRejectedValue(namedError("NotAuthorizedException", "Incorrect username or password."));
    await expect(signIn("a@b.com", "bad")).rejects.toMatchObject({
      code: "NotAuthorizedException",
      message: "Incorrect username or password.",
    });
  });
});

describe("signOut", () => {
  it("delegates to Amplify and leaves storage alone when it cleared the tokens", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    await signOut();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.clearTokens).not.toHaveBeenCalled();
  });

  it("clears tokens directly when Amplify's sign-out stalls", async () => {
    vi.useFakeTimers();
    mocks.signOut.mockReturnValue(new Promise(() => {})); // revoke call never returns
    mocks.loadTokens.mockResolvedValue({ idToken: idToken({ sub: "u1" }) });
    const done = signOut();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(mocks.clearTokens).toHaveBeenCalledOnce();
  });

  it("clears tokens directly when Amplify's sign-out rejects", async () => {
    mocks.signOut.mockRejectedValue(namedError("OAuthSignOutException"));
    mocks.loadTokens.mockResolvedValue({ idToken: idToken({ sub: "u1" }) });
    await signOut();
    expect(mocks.clearTokens).toHaveBeenCalledOnce();
  });
});

describe("onAuthChange", () => {
  it("fires when Amplify ends or starts a session, not on unrelated events", () => {
    const cb = vi.fn();
    const stop = onAuthChange(cb);
    emitHub("tokenRefresh");
    emitHub("tokenRefresh_failure");
    emitHub("signedOut");
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
    emitHub("signedOut");
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

// The redirect outcome settles once per page load, so order matters here.
describe("Google SSO", () => {
  it("starts the hosted UI redirect for Google", async () => {
    mocks.signInWithRedirect.mockResolvedValue(undefined);
    await signInWithGoogle();
    expect(mocks.signInWithRedirect).toHaveBeenCalledWith({ provider: "Google" });
  });

  it("handleAuthCallback resolves once Amplify has stored tokens", async () => {
    mocks.fetchAuthSession.mockResolvedValue(sessionWith({ sub: "u1" }));
    await expect(handleAuthCallback()).resolves.toBeUndefined();
  });

  it("handleAuthCallback times out instead of spinning when no outcome arrives", async () => {
    vi.useFakeTimers();
    mocks.fetchAuthSession.mockResolvedValue({ tokens: undefined });
    const assertion = expect(handleAuthCallback()).rejects.toThrow(/taking too long/i);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("handleAuthCallback rejects with the redirect failure reported on Hub", async () => {
    emitHub("signInWithRedirect_failure", { error: new Error("invalid_grant") });
    mocks.fetchAuthSession.mockResolvedValue({ tokens: undefined });
    await expect(handleAuthCallback()).rejects.toThrow("invalid_grant");
  });

  it("handleAuthCallback waits for a slow exchange (hosted UI visit over 5 minutes)", async () => {
    // Fresh module instance, so its redirect outcome is still pending.
    vi.resetModules();
    const fresh = await import("../auth");
    // fetchAuthSession stopped waiting (deadline passed) before tokens landed.
    mocks.fetchAuthSession
      .mockResolvedValueOnce({ tokens: undefined })
      .mockResolvedValueOnce(sessionWith({ sub: "u1" }));
    const result = fresh.handleAuthCallback();
    await Promise.resolve();
    emitHub("signInWithRedirect");
    await expect(result).resolves.toBeUndefined();
  });
});
