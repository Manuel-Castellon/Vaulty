import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { confirmSignUp, resendConfirmationCode } from "../services/auth";
import styles from "./auth.module.css";

export default function ConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      navigate("/login");
    } catch (err: any) {
      setError(err.message ?? "Confirmation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo(null);
    try {
      await resendConfirmationCode(email);
      setInfo("A new code has been sent to your email.");
    } catch (err: any) {
      setError(err.message ?? "Could not resend code");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Confirm your email</h1>
        <p className={styles.subtitle}>
          Check your inbox for a verification code.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        {info && <p className={styles.info}>{info}</p>}
        <form onSubmit={handleSubmit} className={styles.form}>
          {!emailFromQuery && (
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          <label className={styles.label}>
            Verification code
            <input
              className={styles.input}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              required
              autoFocus
            />
          </label>
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? "Confirming…" : "Confirm"}
          </button>
        </form>
        <p className={styles.footer}>
          Didn't get the code?{" "}
          <button className={styles.link} onClick={handleResend}>
            Resend
          </button>
        </p>
        <p className={styles.footer}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
