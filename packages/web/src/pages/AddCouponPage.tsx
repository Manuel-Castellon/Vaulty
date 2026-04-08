import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { CouponCategory } from "@coupon/shared";

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

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    }
  };

  return (
    <div>
      <h1>Add Coupon</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Title <input value={form.title} onChange={(e) => set("title", e.target.value)} required /></label>
        </div>
        <div>
          <label>Code <input value={form.code} onChange={(e) => set("code", e.target.value)} required /></label>
        </div>
        <div>
          <label>Store <input value={form.store} onChange={(e) => set("store", e.target.value)} required /></label>
        </div>
        <div>
          <label>Category{" "}
            <select value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div>
          <label>Discount type{" "}
            <select value={form.discountType} onChange={(e) => set("discountType", e.target.value)}>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed ($)</option>
            </select>
          </label>
          <input
            type="number"
            value={form.discountValue}
            onChange={(e) => set("discountValue", e.target.value)}
            min="0"
            required
          />
        </div>
        <div>
          <label>Description <textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
        </div>
        <div>
          <label>Expires <input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} /></label>
        </div>
        <button type="submit">Save</button>
        <button type="button" onClick={() => navigate("/")}>Cancel</button>
      </form>
    </div>
  );
}
