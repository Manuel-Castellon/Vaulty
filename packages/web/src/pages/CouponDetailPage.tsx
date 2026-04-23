import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import type { Coupon, CouponStatus } from "@coupon/shared";
import { api } from "../services/api";
import { formatDate } from "../utils/date";
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

function effectiveStatus(coupon: Coupon): CouponStatus {
  const s = coupon.status ?? "active";
  if (s === "used" || s === "archived") return s;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return "expired";
  return "active";
}

export default function CouponDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showQrRaw, setShowQrRaw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

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
    if (!id) return;
    await api.coupons.delete(id);
    navigate("/");
  };

  const handleStatusUpdate = async (status: CouponStatus) => {
    if (!id || !coupon) return;
    setStatusUpdating(true);
    try {
      const updated = await api.coupons.update(id, { status });
      setCoupon(updated);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleShare = async () => {
    if (!id) return;
    setSharing(true);
    try {
      const { shareUrl: url } = await api.sharing.share(id);
      setShareUrl(url);
      if (navigator.share) {
        await navigator.share({ title: coupon?.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Share link copied to clipboard!");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") alert(err.message ?? "Failed to generate share link");
    } finally {
      setSharing(false);
    }
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

  const status = effectiveStatus(coupon);
  const isExpired = status === "expired";
  const days = coupon.expiresAt ? daysUntilExpiry(coupon.expiresAt) : null;
  const expiringSoon = days !== null && days > 0 && days <= 7;

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

  const value = formatValue(coupon);
  const isVoucher = coupon.itemType === "voucher";

  const STATUS_LABEL: Record<CouponStatus, string> = {
    active: "Active",
    used: "Used",
    archived: "Archived",
    expired: "Expired",
  };
  const STATUS_STYLE: Record<CouponStatus, string> = {
    active: styles.statusActive,
    used: styles.statusUsed,
    archived: styles.statusArchived,
    expired: styles.statusExpired,
  };

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
          <h1 className={styles.heroTitle} dir="auto">{coupon.title}</h1>
          <div className={styles.heroBadges}>
            <span className={`${styles.badge}${isVoucher ? ` ${styles.badgeVoucher}` : ""}`}>
              {isVoucher ? "Voucher" : coupon.category}
            </span>
            {isVoucher && (
              <span className={styles.badge}>{coupon.category}</span>
            )}
            {status !== "active" && (
              <span className={`${styles.badge} ${STATUS_STYLE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
            )}
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
                ? `Expired ${formatDate(coupon.expiresAt)}`
                : expiringSoon
                ? `In ${days} day${days !== 1 ? "s" : ""} — ${formatDate(coupon.expiresAt)}`
                : formatDate(coupon.expiresAt)}
            </span>
          </div>
        )}
        {(coupon.qrCode || coupon.qrImageUrl) && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>QR Code</span>
            <div className={styles.qrSection}>
              {coupon.qrCode
                ? <QRCodeSVG value={coupon.qrCode} size={160} />
                : <img src={coupon.qrImageUrl} alt="QR code" style={{ width: 160, height: 160, objectFit: "contain" }} />
              }
              {coupon.qrCode && (
                <>
                  <button
                    type="button"
                    className={styles.updateBtn}
                    onClick={() => setShowQrRaw((value) => !value)}
                  >
                    {showQrRaw ? "Hide raw scan data" : "Show raw scan data"}
                  </button>
                  {showQrRaw && <span className={styles.qrRaw}>{coupon.qrCode}</span>}
                </>
              )}
            </div>
          </div>
        )}
        {coupon.issueDate && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>Issued</span>
            <span className={styles.rowValue}>{formatDate(coupon.issueDate)}</span>
          </div>
        )}
        <div className={styles.row}>
          <span className={styles.rowLabel}>Used</span>
          <span className={styles.rowValue}>
            {coupon.usageCount} time{coupon.usageCount !== 1 ? "s" : ""}
            {coupon.maxUsage ? ` of ${coupon.maxUsage}` : ""}
          </span>
        </div>
      </div>

      {/* Amount tracker */}
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

      {/* Lifecycle actions */}
      <div className={styles.lifecycleSection}>
        <button
          className={`${styles.lifecycleBtn} ${styles.lifecycleBtnUsed}${status === "used" ? ` ${styles.lifecycleBtnActive}` : ""}`}
          onClick={() => handleStatusUpdate(status === "used" ? "active" : "used")}
          disabled={statusUpdating}
        >
          {status === "used" ? "✓ Marked Used" : "Mark as Used"}
        </button>
        <button
          className={`${styles.lifecycleBtn} ${styles.lifecycleBtnArchived}${status === "archived" ? ` ${styles.lifecycleBtnActive}` : ""}`}
          onClick={() => handleStatusUpdate(status === "archived" ? "active" : "archived")}
          disabled={statusUpdating}
        >
          {status === "archived" ? "✓ Archived" : "Archive"}
        </button>
      </div>

      {/* Share */}
      <div style={{ marginBottom: 10 }}>
        <button
          className={styles.updateBtn}
          onClick={handleShare}
          disabled={sharing}
          style={{ width: "100%", padding: "11px 16px", fontSize: 14 }}
        >
          {sharing ? "Generating link…" : "Share"}
        </button>
        {shareUrl && (
          <p style={{ fontSize: 12, color: "#888", marginTop: 6, wordBreak: "break-all" }}>
            {shareUrl}
          </p>
        )}
      </div>

      {/* Edit + Delete */}
      <div className={styles.actionSection}>
        <Link to={`/coupons/${id}/edit`} className={styles.editBtn}>
          Edit
        </Link>
        {confirmDelete ? (
          <div className={styles.deleteConfirmRow}>
            <span className={styles.deleteConfirmText}>Permanently delete this item?</span>
            <button className={styles.deleteConfirmBtn} onClick={handleDelete}>Yes, delete</button>
            <button className={styles.deleteCancelBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
