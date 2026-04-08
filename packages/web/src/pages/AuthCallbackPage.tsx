import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { handleAuthCallback } from "../services/auth";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      navigate("/login");
      return;
    }

    handleAuthCallback(code)
      .then(() => window.location.replace("/"))
      .catch(() => navigate("/login"));
  }, [navigate]);

  return <p style={{ padding: 24 }}>Signing you in…</p>;
}
