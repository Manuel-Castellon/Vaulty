import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import type { SharedCouponView } from "@coupon/shared";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../utils/date";
import styles from "./couponDetail.module.css";

function formatValue(c: SharedCouponView): string | null {
  if (c.discount) {
    if (c.discount.type === "percentage") return `${c.discount.value}% OFF`;
    return `${c.discount.currency} ${c.discount.value} OFF`;
  }
  if (c.faceValue) {
    const cur = c.currency ?? "";
    if (c.cost) return `${cur} ${c.faceValue} value (paid ${cur} ${c.cost})`.trim();
    return `${cur} ${c.faceValue} value`.trim();
  }
  return null;
}

export default function SharedCouponPreviewPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [coupon, setCoupon] = useState<SharedCouponView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    api.sharing
      .getPreview(shareToken)
      .then(setCoupon)
      .catch((err) => setError(err.message ?? "Share link not found or expired"))
      .finally(() => setLoading(false));
  }, [shareToken]);

  const handleClaim = async () => {
    if (!shareToken) return;
    if (!isAuthenticated) {
      navigate(`/login?redirect=/shared/${shareToken}`);
      return;
    }
    setClaiming(true);
    try {
      await api.sharing.claim(shareToken);
      setClaimed(true);
    } catch (err: any) {
      setError(err.message ?? "Failed to claim coupon");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <p className={styles.center}>Loading…</p>;
  if (error) {
    return (
      <div className={styles.page} style={{ textAlign: "center", paddingTop: 60 }}>
        <p style={{ fontSize: 40, margin: 0 }}>🔗</p>
        <p style={{ color: "#ff3b30", fontWeight: 600, marginTop: 12 }}>{error}</p>
        <p style={{ color: "#888", fontSize: 14 }}>This share link may have been revoked or doesn't exist.</p>
      </div>
    );
  }
  if (!coupon) return null;

  const value = formatValue(coupon);
  const isVoucher = coupon.itemType === "voucher";

  return (
    <div className={styles.page}>
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 12, background: "#f0f4ff", color: "#007aff", fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>
          Shared with you
        </span>
      </div>

      {/* Hero card */}
      <div className={`${styles.heroCard}${isVoucher ? ` ${styles.heroCardVoucher}` : ""}`}>
        {coupon.imageUrl && (
          <img src={coupon.imageUrl} alt={coupon.title} className={styles.heroImage} />
        )}
        <div className={styles.heroTop}>
          <h1 className={styles.heroTitle} dir="auto">{coupon.title}</h1>
          <div className={styles.heroBadges}>
            <span className={`${styles.badge}${isVoucher ? ` ${styles.badgeVoucher}` : ""}`}>
              {isVoucher ? "Voucher" : coupon.category}
            </span>
          </div>
        </div>
        <p className={styles.heroStore}>{coupon.store}</p>
        {value && <p className={styles.heroDiscount}>{value}</p>}
        <div className={styles.codeBox}>
          <span className={styles.codeLabel}>Code</span>
          <span className={styles.codeValue}>{coupon.code}</span>
        </div>
      </div>

      {/* Details */}
      <div className={styles.detailsCard}>
        {coupon.description && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Description</span>
            <span className={styles.rowValue} dir="auto">{coupon.description}</span>
          </div>
        )}
        {coupon.conditions && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Conditions</span>
            <span className={styles.rowValue} dir="auto">{coupon.conditions}</span>
          </div>
        )}
        {coupon.expiresAt && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Expires</span>
            <span className={styles.rowValue}>{formatDate(coupon.expiresAt)}</span>
          </div>
        )}
        {coupon.eventDate && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Event date</span>
            <span className={styles.rowValue}>{formatDate(coupon.eventDate)}</span>
          </div>
        )}
        {coupon.seatInfo && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Seats</span>
            <span className={styles.rowValue}>{coupon.seatInfo}</span>
          </div>
        )}
        {coupon.qrCode && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>QR Code</span>
            <QRCodeSVG value={coupon.qrCode} size={160} />
          </div>
        )}
      </div>

      {/* Claim CTA */}
      <div style={{ marginTop: 20 }}>
        {claimed ? (
          <div style={{ background: "#f0fff4", border: "1px solid #34c759", borderRadius: 12, padding: 20, textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#1e8e3e", fontSize: 16 }}>Added to your Vaulty!</p>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "#555" }}>
              You can find it in <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "#007aff", cursor: "pointer", fontWeight: 600, fontSize: 14, padding: 0 }}>My Coupons</button>.
            </p>
          </div>
        ) : (
          <>
            <button
              className={styles.updateBtn}
              onClick={handleClaim}
              disabled={claiming}
              style={{ width: "100%", padding: "14px 16px", fontSize: 16, borderRadius: 12 }}
            >
              {claiming ? "Adding…" : isAuthenticated ? "Add to My Vaulty" : "Sign in to Add"}
            </button>
            {!isAuthenticated && (
              <p style={{ textAlign: "center", fontSize: 13, color: "#888", marginTop: 10 }}>
                Don't have an account?{" "}
                <button
                  onClick={() => navigate(`/signup?redirect=/shared/${shareToken}`)}
                  style={{ background: "none", border: "none", color: "#007aff", cursor: "pointer", fontWeight: 600, fontSize: 13, padding: 0 }}
                >
                  Sign up for free
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
