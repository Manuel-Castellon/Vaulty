import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthCallbackPage from "../AuthCallbackPage";

const navigateMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../../services/auth", () => ({
  handleAuthCallback: vi.fn(),
}));

import { handleAuthCallback } from "../../services/auth";
const mockHandleAuthCallback = handleAuthCallback as ReturnType<typeof vi.fn>;

function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    value: { search, replace: vi.fn() },
    writable: true,
    configurable: true,
  });
}

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearch("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state while exchange is in progress", () => {
    setSearch("?code=abc123");
    mockHandleAuthCallback.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AuthCallbackPage />);
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
  });

  it("redirects to / via hard navigation on successful exchange", async () => {
    setSearch("?code=abc123");
    mockHandleAuthCallback.mockResolvedValue(undefined);
    render(<AuthCallbackPage />);
    await waitFor(() => {
      expect(mockHandleAuthCallback).toHaveBeenCalledWith("abc123");
      expect(window.location.replace).toHaveBeenCalledWith("/");
    });
  });

  it("shows error message (not silent redirect) when exchange fails", async () => {
    setSearch("?code=abc123");
    mockHandleAuthCallback.mockRejectedValue(new Error("Token exchange failed (400): invalid_grant"));
    render(<AuthCallbackPage />);
    await waitFor(() => {
      expect(screen.getByText(/Token exchange failed/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /back to login/i })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("clicking 'Back to login' on error navigates to /login", async () => {
    setSearch("?code=abc123");
    mockHandleAuthCallback.mockRejectedValue(new Error("Token exchange failed (400)"));
    render(<AuthCallbackPage />);
    await waitFor(() => screen.getByRole("button", { name: /back to login/i }));
    await userEvent.click(screen.getByRole("button", { name: /back to login/i }));
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login immediately when no code in URL", async () => {
    setSearch("");
    render(<AuthCallbackPage />);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"));
    expect(mockHandleAuthCallback).not.toHaveBeenCalled();
  });

  it("shows OAuth error from URL params instead of attempting exchange", async () => {
    setSearch("?error=access_denied&error_description=User+cancelled");
    render(<AuthCallbackPage />);
    await waitFor(() => {
      expect(screen.getByText(/access_denied/i)).toBeInTheDocument();
      expect(screen.getByText(/User cancelled/i)).toBeInTheDocument();
    });
    expect(mockHandleAuthCallback).not.toHaveBeenCalled();
  });

  it("does not call handleAuthCallback twice (StrictMode guard)", async () => {
    setSearch("?code=abc123");
    mockHandleAuthCallback.mockResolvedValue(undefined);
    const { rerender } = render(<AuthCallbackPage />);
    rerender(<AuthCallbackPage />);
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith("/"));
    expect(mockHandleAuthCallback).toHaveBeenCalledTimes(1);
  });
});
