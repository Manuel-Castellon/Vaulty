import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";

// Mock the auth service surface the context uses
const mockGetCurrentUserId = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockGetCurrentUserInfo = jest.fn().mockResolvedValue({ email: null, provider: "email" as const });
let mockAuthChangeListener: (() => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock("../services/auth", () => ({
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  getCurrentUserInfo: (...args: unknown[]) => mockGetCurrentUserInfo(...args),
  onAuthChange: (cb: () => void) => {
    mockAuthChangeListener = cb;
    return mockUnsubscribe;
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthChangeListener = null;
  });

  it("starts loading and becomes unauthenticated when no session exists", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("becomes authenticated when a session exists on mount", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-sub");
    mockGetCurrentUserInfo.mockResolvedValue({ email: "user@example.com", provider: "email" as const });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("stops loading even when the session check throws", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetCurrentUserId.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});

    expect(result.current.loading).toBe(false);
  });

  it("refreshAuth transitions isAuthenticated false → true when a session becomes available", async () => {
    mockGetCurrentUserId.mockResolvedValueOnce(null).mockResolvedValueOnce("user-sub");
    mockGetCurrentUserInfo
      .mockResolvedValueOnce({ email: null, provider: "email" as const })
      .mockResolvedValueOnce({ email: "user@example.com", provider: "email" as const });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.refreshAuth();
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("re-checks the session when Amplify ends it on its own", async () => {
    mockGetCurrentUserId.mockResolvedValueOnce("user-sub").mockResolvedValueOnce(null);
    mockGetCurrentUserInfo.mockResolvedValue({ email: "user@example.com", provider: "email" as const });
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      mockAuthChangeListener?.(); // e.g. tokenRefresh_failure after a revoked refresh token
    });
    expect(result.current.isAuthenticated).toBe(false);

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("signOut waits for the service, then transitions isAuthenticated true → false", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-sub");
    mockGetCurrentUserInfo.mockResolvedValue({ email: "user@example.com", provider: "email" as const });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(mockSignOut).toHaveBeenCalled();
  });
});
