import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Coupon } from "@coupon/shared";
import { api } from "../services/api";
import styles from "./couponDetail.module.css";

function formatDiscount(coupon: Coupon): string {
  if (coupon.discount.type === "percentage") {
    return `${coupon.discount.value}% OFF`;
  }
  return `${coupon.discount.currency} ${coupon.discount.value} OFF`;
}

function daysUntilExpiry(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function CouponDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.coupons
      .get(id)
      .then((c) => {
        setCoupon(c);
        setAmountInput(String(c.amountUsed ?? 0));
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id || !window.confirm("Delete this coupon?")) return;
    await api.coupons.delete(id);
    navigate("/");
  };

  const handleAmountSave = async () => {
    if (!id || !coupon) return;
    const parsed = parseFloat(amountInput);
    if (isNaN(parsed)) return;
    setSaving(true);
    const updated = await api.coupons.update(id, { amountUsed: parsed });
    setCoupon(updated);
    setSaving(false);
  };

  if (loading) return <p className={styles.center}>Loading…</p>;
  if (!coupon) return <p className={styles.center}>Coupon not found.</p>;

  const isFixed = coupon.discount.type === "fixed";
  const total = isFixed ? coupon.discount.value : null;
  const amountUsed = coupon.amountUsed ?? 0;
  const remaining = total !== null ? total - amountUsed : null;
  const progressPct = total ? Math.min((amountUsed / total) * 100, 100) : 0;

  const isExpired = coupon.expiresAt ? new Date(coupon.expiresAt) < new Date() : false;
  const days = coupon.expiresAt ? daysUntilExpiry(coupon.expiresAt) : null;
  const expiringSoon = days !== null && days > 0 && days <= 7;

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate("/")}>
        ← Back
      </button>

      {/* Hero card */}
      <div className={styles.heroCard}>
        {coupon.imageUrl && (
          <img src={coupon.imageUrl} alt="Coupon" className={styles.heroImage} />
        )}
        <div className={styles.heroTop}>
          <h1 className={styles.heroTitle}>{coupon.title}</h1>
          <span className={styles.badge}>{coupon.category}</span>
        </div>
        <p className={styles.heroStore}>{coupon.store}</p>
        <p className={styles.heroDiscount}>{formatDiscount(coupon)}</p>
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
            <span className={styles.rowValue}>{coupon.description}</span>
          </div>
        )}
        {coupon.expiresAt && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Expires</span>
            <span className={`${styles.rowValue}${isExpired ? ` ${styles.expiryExpired}` : expiringSoon ? ` ${styles.expiryWarn}` : ""}`}>
              {isExpired
                ? `Expired ${new Date(coupon.expiresAt).toLocaleDateString()}`
                : expiringSoon
                ? `In ${days} day${days !== 1 ? "s" : ""} — ${new Date(coupon.expiresAt).toLocaleDateString()}`
                : new Date(coupon.expiresAt).toLocaleDateString()}
            </span>
          </div>
        )}
        {coupon.qrCode && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>QR Code</span>
            <span className={styles.rowValue}>{coupon.qrCode}</span>
          </div>
        )}
        <div className={styles.row}>
          <span className={styles.rowLabel}>Used</span>
          <span className={styles.rowValue}>{coupon.usageCount} time{coupon.usageCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Amount tracker (fixed-value coupons only) */}
      {isFixed && total !== null && (
        <div className={styles.trackerCard}>
          <p className={styles.trackerTitle}>Amount Tracker</p>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
          <div className={styles.progressLabels}>
            <span>Used: {coupon.discount.currency} {amountUsed.toFixed(2)}</span>
            <span className={styles.progressRemaining}>
              {coupon.discount.currency} {(remaining ?? 0).toFixed(2)} remaining
            </span>
          </div>
          <div className={styles.trackerInput}>
            <input
              className={styles.amountInput}
              type="number"
              min={0}
              max={total}
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="Amount used"
            />
            <button className={styles.updateBtn} onClick={handleAmountSave} disabled={saving}>
              {saving ? "Saving…" : "Update"}
            </button>
          </div>
        </div>
      )}

      {/* Delete */}
      <div className={styles.deleteSection}>
        <button className={styles.deleteBtn} onClick={handleDelete}>
          Delete Coupon
        </button>
      </div>
    </div>
  );
}
