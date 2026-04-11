import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "../ResetPasswordPage";

const navigateMock = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [mockSearchParams],
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../services/auth", () => ({
  confirmForgotPassword: vi.fn(),
}));

import { confirmForgotPassword } from "../../services/auth";
const mockConfirm = confirmForgotPassword as ReturnType<typeof vi.fn>;

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams("email=user%40example.com");
  });

  it("renders code and password fields", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByLabelText(/reset code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it("does not show email field when email is in query params", () => {
    render(<ResetPasswordPage />);
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
  });

  it("shows email field when no email query param", () => {
    mockSearchParams = new URLSearchParams();
    render(<ResetPasswordPage />);
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/reset code/i), "123456");
    await userEvent.type(screen.getByLabelText(/^new password/i), "password1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "password2");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("shows error when password is too short", async () => {
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/reset code/i), "123456");
    await userEvent.type(screen.getByLabelText(/^new password/i), "short");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("calls confirmForgotPassword with email, code, and new password", async () => {
    mockConfirm.mockResolvedValue(undefined);
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/reset code/i), "654321");
    await userEvent.type(screen.getByLabelText(/^new password/i), "newpassword1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "newpassword1");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith("user@example.com", "654321", "newpassword1");
    });
  });

  it("navigates to /login?reset=1 on success", async () => {
    mockConfirm.mockResolvedValue(undefined);
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/reset code/i), "654321");
    await userEvent.type(screen.getByLabelText(/^new password/i), "newpassword1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "newpassword1");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login?reset=1");
    });
  });

  it("shows Cognito error message on failure", async () => {
    mockConfirm.mockRejectedValue(new Error("Invalid verification code provided"));
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/reset code/i), "000000");
    await userEvent.type(screen.getByLabelText(/^new password/i), "newpassword1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "newpassword1");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => {
      expect(screen.getByText(/Invalid verification code/i)).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows loading state during submission", async () => {
    mockConfirm.mockReturnValue(new Promise(() => {}));
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText(/reset code/i), "654321");
    await userEvent.type(screen.getByLabelText(/^new password/i), "newpassword1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "newpassword1");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
    expect(screen.getByRole("button", { name: /resetting/i })).toBeDisabled();
  });
});
