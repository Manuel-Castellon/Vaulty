import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../AuthContext";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getCurrentUserInfo: vi.fn(),
  signOut: vi.fn(),
  authChangeListener: null as (() => void) | null,
  unsubscribe: vi.fn(),
}));

vi.mock("../../services/auth", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  getCurrentUserInfo: mocks.getCurrentUserInfo,
  signOut: mocks.signOut,
  onAuthChange: (cb: () => void) => {
    mocks.authChangeListener = cb;
    return mocks.unsubscribe;
  },
}));

let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <p>{auth.loading ? "loading" : auth.isAuthenticated ? `in:${auth.userEmail}` : "out"}</p>;
}

describe("AuthContext (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.getCurrentUserInfo.mockResolvedValue({ email: "a@b.com", provider: "email" });
  });

  it("re-checks the session when Amplify ends it on its own", async () => {
    mocks.getCurrentUserId.mockResolvedValueOnce("user-sub").mockResolvedValueOnce(null);
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("in:a@b.com")).toBeInTheDocument());

    await act(async () => mocks.authChangeListener?.()); // e.g. tokenRefresh_failure
    await waitFor(() => expect(screen.getByText("out")).toBeInTheDocument());

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it("stops loading even when the session check throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getCurrentUserId.mockRejectedValue(new Error("boom"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("out")).toBeInTheDocument());
  });

  it("signOut waits for the service before clearing state", async () => {
    let finish!: () => void;
    mocks.signOut.mockReturnValue(new Promise<void>((r) => (finish = r)));
    mocks.getCurrentUserId.mockResolvedValue("user-sub");
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("in:a@b.com")).toBeInTheDocument());

    let done!: Promise<void>;
    act(() => {
      done = auth.signOut();
    });
    expect(screen.getByText("in:a@b.com")).toBeInTheDocument();
    await act(async () => {
      finish();
      await done;
    });
    expect(screen.getByText("out")).toBeInTheDocument();
  });
});
