import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { handleAuthCallback } from "../services/auth";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const called = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");
    const oauthErrorDescription = params.get("error_description");

    if (oauthError) {
      const desc = oauthErrorDescription ?? "";
      // Cognito returns invalid_request when the user already has an email/password
      // account and tries to sign in with Google using the same email.
      // Also catch description variants with "already_exists" / "already exists".
      const isEmailConflict =
        oauthError === "invalid_request" ||
        desc.includes("already_exists") ||
        desc.includes("already exists");
      const message = isEmailConflict
        ? "An account with this email already exists. Sign in with your password instead."
        : `Sign-in failed: ${oauthError}${desc ? ` — ${desc}` : ""}`;
      setError(message);
      return;
    }

    if (!code) {
      navigate("/login");
      return;
    }

    handleAuthCallback(code)
      .then(() => window.location.replace("/"))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Sign-in failed";
        console.error("[auth-callback] token exchange failed:", message);
        setError(message);
      });
  }, [navigate]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "red", marginBottom: 16 }}>{error}</p>
        <button type="button" onClick={() => navigate("/login")}>Back to login</button>
      </div>
    );
  }

  return <p style={{ padding: 24 }}>Signing you in…</p>;
}
