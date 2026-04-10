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
      setError(`OAuth error: ${oauthError}${oauthErrorDescription ? ` — ${oauthErrorDescription}` : ""}`);
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
