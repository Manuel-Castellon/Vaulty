import React from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import LoginScreen from "../app/login";

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockSignIn = jest.fn();
const mockSignInWithGoogle = jest.fn();
jest.mock("../services/auth", () => ({
  signIn: (...a: unknown[]) => mockSignIn(...a),
  signInWithGoogle: (...a: unknown[]) => mockSignInWithGoogle(...a),
  isGoogleSignInCancel: (err: unknown) => err instanceof Error && err.message === "canceled",
}));

const mockRefreshAuth = jest.fn().mockResolvedValue(undefined);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ refreshAuth: mockRefreshAuth }),
}));

function withProps(message: string, props: Record<string, unknown>): Error {
  return Object.assign(new Error(message), props);
}

// The first test renders the screen cold, which took over 5s on a CI runner.
jest.setTimeout(15_000);

describe("LoginScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("routes a reset-required user to forgot-password with the email", async () => {
    mockSignIn.mockRejectedValue(withProps("reset", { code: "PasswordResetRequiredException" }));
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    fireEvent.changeText(screen.getByPlaceholderText("••••••••"), "pw");
    const signInTexts = screen.getAllByText("Sign in"); // title, then button
    fireEvent.press(signInTexts[signInTexts.length - 1]);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/forgot-password?email=a%40b.com"));
  });

  it("shows an alert when Google sign-in fails before any redirect", async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error("No eligible browser found on device"));
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("Continue with Google"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("Google sign-in failed", "No eligible browser found on device")
    );
  });

  it("stays quiet when the user closes the Google tab", async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error("canceled"));
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("Continue with Google"));
    await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("leaves errors after the redirect to the callback screen", async () => {
    mockSignInWithGoogle.mockRejectedValue(withProps("invalid_grant", { shownByCallbackScreen: true }));
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("Continue with Google"));
    await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("disables the Google button while a sign-in is open", async () => {
    let finish!: () => void;
    mockSignInWithGoogle.mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("Continue with Google"));
    expect(screen.getByText("Opening Google…")).toBeTruthy();
    fireEvent.press(screen.getByText("Opening Google…"));
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(mockRefreshAuth).toHaveBeenCalled());
  });
});
