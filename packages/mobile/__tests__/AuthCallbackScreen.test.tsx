import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react-native";
import AuthCallbackScreen from "../app/auth/callback";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: jest.fn(),
}));

import { useLocalSearchParams } from "expo-router";
const mockParams = useLocalSearchParams as jest.Mock;

const mockHandleAuthCallback = jest.fn();
jest.mock("../services/auth", () => ({
  handleAuthCallback: (...args: unknown[]) => mockHandleAuthCallback(...args),
}));

const mockRefreshAuth = jest.fn();
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ refreshAuth: mockRefreshAuth }),
}));

describe("AuthCallbackScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading indicator while exchange is in progress", () => {
    mockParams.mockReturnValue({ code: "abc123" });
    mockHandleAuthCallback.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AuthCallbackScreen />);
    expect(screen.getByText(/signing you in/i)).toBeTruthy();
  });

  it("redirects to / after successful token exchange", async () => {
    mockParams.mockReturnValue({ code: "abc123" });
    mockHandleAuthCallback.mockResolvedValue(undefined);
    mockRefreshAuth.mockResolvedValue(undefined);
    render(<AuthCallbackScreen />);
    await waitFor(() => {
      expect(mockHandleAuthCallback).toHaveBeenCalledWith("abc123");
      expect(mockRefreshAuth).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("shows error message when token exchange fails", async () => {
    mockParams.mockReturnValue({ code: "abc123" });
    mockHandleAuthCallback.mockRejectedValue(new Error("Token exchange failed (400): invalid_grant"));
    render(<AuthCallbackScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Token exchange failed/i)).toBeTruthy();
    });
    expect(screen.getByText(/Back to sign in/i)).toBeTruthy();
  });

  it("pressing 'Back to sign in' navigates to /login", async () => {
    mockParams.mockReturnValue({ code: "abc123" });
    mockHandleAuthCallback.mockRejectedValue(new Error("Token exchange failed"));
    render(<AuthCallbackScreen />);
    await waitFor(() => screen.getByText(/Back to sign in/i));
    fireEvent.press(screen.getByText(/Back to sign in/i));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login immediately when no code and no error in URL", async () => {
    mockParams.mockReturnValue({});
    render(<AuthCallbackScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(mockHandleAuthCallback).not.toHaveBeenCalled();
  });

  it("shows raw OAuth error for non-conflict errors (e.g. access_denied)", async () => {
    mockParams.mockReturnValue({ error: "access_denied", error_description: "User cancelled" });
    render(<AuthCallbackScreen />);
    await waitFor(() => {
      expect(screen.getByText(/access_denied/i)).toBeTruthy();
      expect(screen.getByText(/User cancelled/i)).toBeTruthy();
    });
    expect(mockHandleAuthCallback).not.toHaveBeenCalled();
  });

  it("shows helpful message for email-conflict (invalid_request)", async () => {
    mockParams.mockReturnValue({
      error: "invalid_request",
      error_description: "Already found an entry for username already_exists",
    });
    render(<AuthCallbackScreen />);
    await waitFor(() => {
      expect(screen.getByText(/account with this email already exists/i)).toBeTruthy();
      expect(screen.getByText(/sign in with your password instead/i)).toBeTruthy();
    });
    expect(mockHandleAuthCallback).not.toHaveBeenCalled();
  });

  it("shows helpful message for invalid_request even without a matching description", async () => {
    mockParams.mockReturnValue({ error: "invalid_request", error_description: "Some other Cognito message" });
    render(<AuthCallbackScreen />);
    await waitFor(() => {
      expect(screen.getByText(/account with this email already exists/i)).toBeTruthy();
    });
  });
});
