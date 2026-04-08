import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { CouponCategory } from "@coupon/shared";
import styles from "./addCoupon.module.css";

const CATEGORIES: CouponCategory[] = [
  "food", "retail", "travel", "entertainment", "health", "tech", "other",
];

export default function AddCouponPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    code: "",
    title: "",
    description: "",
    store: "",
    category: "other" as CouponCategory,
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: "",
    expiresAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.coupons.create({
        code: form.code,
        title: form.title,
        description: form.description || undefined,
        store: form.store,
        category: form.category,
        discount:
          form.discountType === "percentage"
            ? { type: "percentage", value: parseFloat(form.discountValue) }
            : { type: "fixed", value: parseFloat(form.discountValue), currency: "USD" },
        expiresAt: form.expiresAt || undefined,
      });
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Add Coupon</h1>
        <p className={styles.subtitle}>Save a new coupon to your vault.</p>
      </div>

      <div className={styles.card}>
        {error && <p className={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Title
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. 20% off summer sale"
              required
            />
          </label>

          <label className={styles.label}>
            Coupon Code
            <input
              className={styles.input}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="e.g. SUMMER20"
              required
            />
          </label>

          <label className={styles.label}>
            Store
            <input
              className={styles.input}
              value={form.store}
              onChange={(e) => set("store", e.target.value)}
              placeholder="e.g. Nike"
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

          <label className={styles.label}>
            Discount
            <div className={styles.discountRow}>
              <select
                className={styles.select}
                value={form.discountType}
                onChange={(e) => set("discountType", e.target.value)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed ($)</option>
              </select>
              <input
                className={styles.input}
                type="number"
                value={form.discountValue}
                onChange={(e) => set("discountValue", e.target.value)}
                placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 50"}
                min="0"
                required
              />
            </div>
          </label>

          <label className={styles.label}>
            Description
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional notes or conditions…"
            />
          </label>

          <label className={styles.label}>
            Expiry Date
            <input
              className={styles.input}
              type="date"
              value={form.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
            />
          </label>

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? "Saving…" : "Save Coupon"}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => navigate("/")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
