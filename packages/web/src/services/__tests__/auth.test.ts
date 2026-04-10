import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Cognito SDK before importing auth
vi.mock("amazon-cognito-identity-js", () => {
  const mockGetSession = vi.fn();
  const mockSignOut = vi.fn();
  const mockCurrentUser = { getSession: mockGetSession, signOut: mockSignOut };
  const mockPool = {
    getCurrentUser: vi.fn(() => mockCurrentUser),
    signUp: vi.fn(),
  };
  return {
    CognitoUserPool: vi.fn(() => mockPool),
    CognitoUser: vi.fn(),
    AuthenticationDetails: vi.fn(),
    CognitoUserAttribute: vi.fn(),
    __mockPool: mockPool,
    __mockCurrentUser: mockCurrentUser,
    __mockGetSession: mockGetSession,
  };
});

// Import after mock is set up
import { handleAuthCallback, getIdToken, getCurrentUserId, signOut } from "../auth";
import * as cognitoModule from "amazon-cognito-identity-js";

// Access the mocks through the module
const mocks = cognitoModule as any;

// Helper to build a JWT with arbitrary payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

function futureExp() {
  return Math.floor(Date.now() / 1000) + 3600; // 1h from now
}

function pastExp() {
  return Math.floor(Date.now() / 1000) - 1; // 1s ago
}

describe("handleAuthCallback", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchanges code for token and stores it in localStorage", async () => {
    const fakeToken = makeJwt({ sub: "user-123", exp: futureExp() });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: fakeToken }),
    });

    await handleAuthCallback("auth-code-abc");

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/oauth2/token");
    const body = new URLSearchParams(options.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code-abc");
    expect(body.get("redirect_uri")).toContain("/auth/callback");
    expect(localStorage.getItem("vaulty_id_token")).toBe(fakeToken);
  });

  it("throws with status and body on non-ok response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    });

    await expect(handleAuthCallback("bad-code")).rejects.toThrow("400");
    expect(localStorage.getItem("vaulty_id_token")).toBeNull();
  });

  it("throws when fetch itself fails (network error)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    await expect(handleAuthCallback("any-code")).rejects.toThrow("Network error");
    expect(localStorage.getItem("vaulty_id_token")).toBeNull();
  });
});

describe("getIdToken — federated (localStorage) path", () => {
  beforeEach(() => {
    localStorage.clear();
    // No Cognito pool user
    mocks.__mockPool.getCurrentUser.mockReturnValue(null);
  });

  it("returns null when no token in localStorage", async () => {
    expect(await getIdToken()).toBeNull();
  });

  it("returns null when stored token is expired", async () => {
    localStorage.setItem("vaulty_id_token", makeJwt({ sub: "u1", exp: pastExp() }));
    expect(await getIdToken()).toBeNull();
    expect(localStorage.getItem("vaulty_id_token")).toBeNull(); // also cleaned up
  });

  it("returns the token when valid and not expired", async () => {
    const token = makeJwt({ sub: "u1", exp: futureExp() });
    localStorage.setItem("vaulty_id_token", token);
    expect(await getIdToken()).toBe(token);
  });

  it("returns null for a malformed token", async () => {
    localStorage.setItem("vaulty_id_token", "not.a.jwt");
    expect(await getIdToken()).toBeNull();
  });
});

describe("getCurrentUserId — federated path", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.__mockPool.getCurrentUser.mockReturnValue(null);
  });

  it("returns null when no token present", async () => {
    expect(await getCurrentUserId()).toBeNull();
  });

  it("returns sub from a valid stored token", async () => {
    const token = makeJwt({ sub: "user-xyz", exp: futureExp() });
    localStorage.setItem("vaulty_id_token", token);
    expect(await getCurrentUserId()).toBe("user-xyz");
  });

  it("returns null when stored token is expired", async () => {
    localStorage.setItem("vaulty_id_token", makeJwt({ sub: "u1", exp: pastExp() }));
    expect(await getCurrentUserId()).toBeNull();
  });
});

describe("getCurrentUserId — Cognito session path", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns sub from a valid Cognito session", async () => {
    const mockSession = {
      isValid: () => true,
      getIdToken: () => ({ payload: { sub: "cognito-user-999" } }),
    };
    mocks.__mockPool.getCurrentUser.mockReturnValue(mocks.__mockCurrentUser);
    mocks.__mockGetSession.mockImplementation((cb: Function) =>
      cb(null, mockSession)
    );

    expect(await getCurrentUserId()).toBe("cognito-user-999");
  });

  it("falls back to federated token when Cognito session is invalid", async () => {
    const token = makeJwt({ sub: "federated-user", exp: futureExp() });
    localStorage.setItem("vaulty_id_token", token);

    mocks.__mockPool.getCurrentUser.mockReturnValue(mocks.__mockCurrentUser);
    mocks.__mockGetSession.mockImplementation((cb: Function) =>
      cb(new Error("Session expired"), null)
    );

    expect(await getCurrentUserId()).toBe("federated-user");
  });
});

describe("signOut", () => {
  it("removes the federated token from localStorage", () => {
    localStorage.setItem("vaulty_id_token", "sometoken");
    mocks.__mockPool.getCurrentUser.mockReturnValue(mocks.__mockCurrentUser);
    signOut();
    expect(localStorage.getItem("vaulty_id_token")).toBeNull();
  });
});
