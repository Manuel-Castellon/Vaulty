import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "../ForgotPasswordPage";

const navigateMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../services/auth", () => ({
  forgotPassword: vi.fn(),
}));

import { forgotPassword } from "../../services/auth";
const mockForgotPassword = forgotPassword as ReturnType<typeof vi.fn>;

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email input and submit button", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send reset code/i })).toBeInTheDocument();
  });

  it("shows loading state while request is in flight", async () => {
    mockForgotPassword.mockReturnValue(new Promise(() => {}));
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset code/i }));
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });

  it("navigates to /reset-password with email param on success", async () => {
    mockForgotPassword.mockResolvedValue(undefined);
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset code/i }));
    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith("user@example.com");
      expect(navigateMock).toHaveBeenCalledWith(
        "/reset-password?email=user%40example.com"
      );
    });
  });

  it("trims whitespace from email before calling forgotPassword", async () => {
    mockForgotPassword.mockResolvedValue(undefined);
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "  user@example.com  ");
    await userEvent.click(screen.getByRole("button", { name: /send reset code/i }));
    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith("user@example.com");
    });
  });

  it("shows error message when forgotPassword rejects", async () => {
    mockForgotPassword.mockRejectedValue(new Error("User not found"));
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset code/i }));
    await waitFor(() => {
      expect(screen.getByText("User not found")).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("re-enables submit button after failure", async () => {
    mockForgotPassword.mockRejectedValue(new Error("Error"));
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "x@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset code/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send reset code/i })).not.toBeDisabled();
    });
  });
});
