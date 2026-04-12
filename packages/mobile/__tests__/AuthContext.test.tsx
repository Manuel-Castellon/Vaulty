import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { AuthProvider, useAuth, __resetStorageInitForTests } from "../context/AuthContext";

// Mock getIdToken, signOut, and initSecureStorage from auth service
const mockGetIdToken = jest.fn();
const mockSignOut = jest.fn();
const mockInitSecureStorage = jest.fn().mockResolvedValue(undefined);

jest.mock("../services/auth", () => ({
  getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  initSecureStorage: (...args: unknown[]) => mockInitSecureStorage(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetStorageInitForTests();
  });

  it("starts loading and becomes unauthenticated when no token exists", async () => {
    mockGetIdToken.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("becomes authenticated when a token exists on mount", async () => {
    mockGetIdToken.mockResolvedValue("id-token-xyz");
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("refreshAuth transitions isAuthenticated false → true when token becomes available", async () => {
    mockGetIdToken.mockResolvedValueOnce(null).mockResolvedValueOnce("new-token");
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.refreshAuth();
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("signOut transitions isAuthenticated true → false", async () => {
    mockGetIdToken.mockResolvedValue("id-token-xyz");
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.signOut();
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(mockSignOut).toHaveBeenCalled();
  });
});
