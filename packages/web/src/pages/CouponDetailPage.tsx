import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Coupon } from "@coupon/shared";
import { api } from "../services/api";
import styles from "./couponDetail.module.css";

function formatValue(coupon: Coupon): string | null {
  if (coupon.discount) {
    if (coupon.discount.type === "percentage") return `${coupon.discount.value}% OFF`;
    return `${coupon.discount.currency} ${coupon.discount.value} OFF`;
  }
  if (coupon.faceValue) {
    const cur = coupon.currency ?? "";
    if (coupon.cost) return `${cur} ${coupon.faceValue} value (paid ${cur} ${coupon.cost})`.trim();
    return `${cur} ${coupon.faceValue} value`.trim();
  }
  return null;
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
    if (!id || !window.confirm("Delete this item?")) return;
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
  if (!coupon) return <p className={styles.center}>Item not found.</p>;

  // Amount tracking: works for fixed-discount coupons and credit vouchers
  const trackingTotal =
    coupon.discount?.type === "fixed"
      ? coupon.discount.value
      : coupon.faceValue ?? null;
  const trackingCurrency =
    coupon.discount?.type === "fixed"
      ? coupon.discount.currency
      : coupon.currency ?? "";
  const amountUsed = coupon.amountUsed ?? 0;
  const remaining = trackingTotal !== null ? trackingTotal - amountUsed : null;
  const progressPct = trackingTotal ? Math.min((amountUsed / trackingTotal) * 100, 100) : 0;

  const isExpired = coupon.expiresAt ? new Date(coupon.expiresAt) < new Date() : false;
  const days = coupon.expiresAt ? daysUntilExpiry(coupon.expiresAt) : null;
  const expiringSoon = days !== null && days > 0 && days <= 7;

  const value = formatValue(coupon);
  const isVoucher = coupon.itemType === "voucher";

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate("/")}>
        ← Back
      </button>

      {/* Hero card */}
      <div className={`${styles.heroCard}${isVoucher ? ` ${styles.heroCardVoucher}` : ""}`}>
        {coupon.imageUrl && (
          <img src={coupon.imageUrl} alt={coupon.title} className={styles.heroImage} />
        )}
        <div className={styles.heroTop}>
          <h1 className={styles.heroTitle}>{coupon.title}</h1>
          <span className={`${styles.badge}${isVoucher ? ` ${styles.badgeVoucher}` : ""}`}>
            {isVoucher ? "Voucher" : coupon.category}
          </span>
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
            <span className={styles.rowValue}>{coupon.description}</span>
          </div>
        )}
        {coupon.conditions && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Conditions</span>
            <span className={styles.rowValue}>{coupon.conditions}</span>
          </div>
        )}
        {coupon.eventDate && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Event date</span>
            <span className={styles.rowValue}>{new Date(coupon.eventDate).toLocaleDateString()}</span>
          </div>
        )}
        {coupon.seatInfo && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Seats</span>
            <span className={styles.rowValue}>{coupon.seatInfo}</span>
          </div>
        )}
        {coupon.quantity && coupon.quantity > 1 && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Quantity</span>
            <span className={styles.rowValue}>{coupon.quantity}</span>
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

      {/* Amount tracker — fixed-discount coupons and credit vouchers */}
      {trackingTotal !== null && (
        <div className={styles.trackerCard}>
          <p className={styles.trackerTitle}>Amount Tracker</p>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
          <div className={styles.progressLabels}>
            <span>Used: {trackingCurrency} {amountUsed.toFixed(2)}</span>
            <span className={styles.progressRemaining}>
              {trackingCurrency} {(remaining ?? 0).toFixed(2)} remaining
            </span>
          </div>
          <div className={styles.trackerInput}>
            <input
              className={styles.amountInput}
              type="number"
              min={0}
              max={trackingTotal}
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
          Delete {isVoucher ? "Voucher" : "Coupon"}
        </button>
      </div>
    </div>
  );
}
