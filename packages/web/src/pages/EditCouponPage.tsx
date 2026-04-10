import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { Coupon, CouponCategory } from "@coupon/shared";
import styles from "./addCoupon.module.css";

const CATEGORIES: CouponCategory[] = [
  "food", "retail", "travel", "entertainment", "health", "tech", "other",
];

type FormState = {
  code: string;
  title: string;
  description: string;
  store: string;
  category: CouponCategory;
  discountType: "percentage" | "fixed";
  discountValue: string;
  faceValue: string;
  cost: string;
  currency: string;
  expiresAt: string;
  eventDate: string;
  seatInfo: string;
  conditions: string;
  quantity: string;
  maxUsage: string;
  qrCode: string;
};

function couponToForm(coupon: Coupon): { form: FormState; itemType: "coupon" | "voucher" } {
  const fixedCurrency =
    coupon.discount?.type === "fixed" ? coupon.discount.currency : undefined;
  return {
    itemType: coupon.itemType,
    form: {
      code: coupon.code,
      title: coupon.title,
      description: coupon.description ?? "",
      store: coupon.store,
      category: coupon.category,
      discountType: coupon.discount?.type ?? "percentage",
      discountValue: coupon.discount ? String(coupon.discount.value) : "",
      faceValue: coupon.faceValue ? String(coupon.faceValue) : "",
      cost: coupon.cost ? String(coupon.cost) : "",
      currency: fixedCurrency ?? coupon.currency ?? "ILS",
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
      eventDate: coupon.eventDate ? coupon.eventDate.slice(0, 10) : "",
      seatInfo: coupon.seatInfo ?? "",
      conditions: coupon.conditions ?? "",
      quantity: coupon.quantity ? String(coupon.quantity) : "",
      maxUsage: coupon.maxUsage ? String(coupon.maxUsage) : "",
      qrCode: coupon.qrCode ?? "",
    },
  };
}

export default function EditCouponPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [itemType, setItemType] = useState<"coupon" | "voucher">("coupon");
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAdvancedQr, setShowAdvancedQr] = useState(false);

  const set = (field: keyof FormState, value: string) =>
    setForm((f) => f ? { ...f, [field]: value } : f);

  useEffect(() => {
    if (!id) return;
    api.coupons.get(id).then((coupon) => {
      const { form: f, itemType: t } = couponToForm(coupon);
      setForm(f);
      setItemType(t);
    }).catch(() => setError("Failed to load item."))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.coupons.update(id, {
        itemType,
        code: form.code,
        title: form.title,
        description: form.description || undefined,
        store: form.store,
        category: form.category,
        ...(itemType === "coupon" && form.discountValue
          ? {
              discount:
                form.discountType === "percentage"
                  ? { type: "percentage", value: parseFloat(form.discountValue) }
                  : { type: "fixed", value: parseFloat(form.discountValue), currency: form.currency || "ILS" },
            }
          : { discount: undefined }),
        ...(itemType === "voucher"
          ? {
              faceValue: form.faceValue ? parseFloat(form.faceValue) : undefined,
              cost: form.cost ? parseFloat(form.cost) : undefined,
              currency: form.currency || undefined,
            }
          : {}),
        expiresAt: form.expiresAt || undefined,
        eventDate: form.eventDate || undefined,
        seatInfo: form.seatInfo || undefined,
        conditions: form.conditions || undefined,
        quantity: form.quantity ? parseInt(form.quantity, 10) : undefined,
        maxUsage: form.maxUsage ? parseInt(form.maxUsage, 10) : undefined,
        qrCode: form.qrCode || undefined,
      });
      navigate(`/coupons/${id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className={styles.page}>Loading…</p>;
  if (!form) return <p className={styles.page}>{error ?? "Item not found."}</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Edit {itemType === "voucher" ? "Voucher" : "Coupon"}</h1>
      </div>

      <div className={styles.card}>
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.typeToggle}>
          {(["coupon", "voucher"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.typeBtn}${itemType === t ? ` ${styles.typeBtnActive}` : ""}`}
              onClick={() => setItemType(t)}
            >
              {t === "coupon" ? "Coupon" : "Voucher"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Title
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
            />
          </label>

          <label className={styles.label}>
            Code / Barcode
            <input
              className={styles.input}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              required
            />
          </label>

          <label className={styles.label}>
            Store / Vendor
            <input
              className={styles.input}
              value={form.store}
              onChange={(e) => set("store", e.target.value)}
              required
            />
          </label>

          <label className={styles.label}>
            Category
            <select
              className={styles.select}
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </label>

          {itemType === "coupon" && (
            <label className={styles.label}>
              Discount
              <div className={styles.discountRow}>
                <select
                  className={styles.select}
                  value={form.discountType}
                  onChange={(e) => set("discountType", e.target.value as "percentage" | "fixed")}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed amount</option>
                </select>
                <input
                  className={styles.input}
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => set("discountValue", e.target.value)}
                  placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 50"}
                  min="0"
                />
              </div>
            </label>
          )}

          {itemType === "voucher" && (
            <>
              <label className={styles.label}>
                Face value (what you get)
                <input
                  className={styles.input}
                  type="number"
                  value={form.faceValue}
                  onChange={(e) => set("faceValue", e.target.value)}
                  min="0"
                />
              </label>
              <label className={styles.label}>
                Cost (what you paid)
                <input
                  className={styles.input}
                  type="number"
                  value={form.cost}
                  onChange={(e) => set("cost", e.target.value)}
                  min="0"
                />
              </label>
              <label className={styles.label}>
                Currency
                <input
                  className={styles.input}
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  placeholder="e.g. ILS, USD"
                />
              </label>
            </>
          )}

          <label className={styles.label}>
            Description
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>

          <div className={styles.optionalSection}>
            <p className={styles.optionalHeading}>Optional details</p>

            <label className={styles.label}>
              Expiry Date
              <input className={styles.input} type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
            </label>

            {itemType === "voucher" && (
              <>
                <label className={styles.label}>
                  Event Date
                  <input className={styles.input} type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
                </label>
                <label className={styles.label}>
                  Seat / Location info
                  <input className={styles.input} value={form.seatInfo} onChange={(e) => set("seatInfo", e.target.value)} />
                </label>
                <label className={styles.label}>
                  Quantity
                  <input className={styles.input} type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} min="1" />
                </label>
              </>
            )}

            <label className={styles.label}>
              Conditions / Restrictions
              <input className={styles.input} value={form.conditions} onChange={(e) => set("conditions", e.target.value)} />
            </label>

            <label className={styles.label}>
              Max uses
              <input className={styles.input} type="number" value={form.maxUsage} onChange={(e) => set("maxUsage", e.target.value)} min="1" />
            </label>

            <button
              type="button"
              className={styles.extractBtn}
              onClick={() => setShowAdvancedQr((value) => !value)}
            >
              {showAdvancedQr ? "Hide advanced scan data" : "Show advanced scan data"}
            </button>
            {showAdvancedQr && (
              <label className={styles.label}>
                QR Code / Barcode data (advanced)
                <input className={styles.input} value={form.qrCode} onChange={(e) => set("qrCode", e.target.value)} />
              </label>
            )}
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => navigate(`/coupons/${id}`)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
