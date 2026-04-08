import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Coupon } from "@coupon/shared";
import { api } from "../services/api";

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

  if (loading) return <p>Loading...</p>;
  if (!coupon) return <p>Coupon not found.</p>;

  const isFixed = coupon.discount.type === "fixed";
  const total = isFixed ? coupon.discount.value : null;
  const remaining = total !== null ? total - (coupon.amountUsed ?? 0) : null;

  return (
    <div>
      {coupon.imageUrl && (
        <img src={coupon.imageUrl} alt="Coupon" style={{ maxWidth: "100%", marginBottom: 16 }} />
      )}
      <h1>{coupon.title}</h1>
      <p><strong>Code:</strong> <code>{coupon.code}</code></p>
      {coupon.qrCode && <p><strong>QR:</strong> {coupon.qrCode}</p>}
      <p><strong>Store:</strong> {coupon.store}</p>
      <p><strong>Category:</strong> {coupon.category}</p>
      {coupon.description && <p>{coupon.description}</p>}
      {coupon.expiresAt && (
        <p><strong>Expires:</strong> {new Date(coupon.expiresAt).toLocaleDateString()}</p>
      )}

      <p>
        <strong>Discount:</strong>{" "}
        {isFixed
          ? `${coupon.discount.currency} ${coupon.discount.value}`
          : `${coupon.discount.value}%`}
      </p>

      {isFixed && total !== null && (
        <div>
          <p>
            <strong>Amount used:</strong> {coupon.discount.currency} {coupon.amountUsed ?? 0} of {total}
            {" "}({coupon.discount.currency} {remaining} remaining)
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={total}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            <button onClick={handleAmountSave} disabled={saving}>
              {saving ? "Saving…" : "Update used amount"}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={handleDelete} style={{ color: "red" }}>Delete</button>
        <button onClick={() => navigate("/")}>Back</button>
      </div>
    </div>
  );
}
