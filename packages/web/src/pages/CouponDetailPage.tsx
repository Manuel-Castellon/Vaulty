import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Coupon } from "@coupon/shared";
import { api } from "../services/api";

export default function CouponDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.coupons
      .get(id)
      .then(setCoupon)
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    await api.coupons.delete(id);
    navigate("/");
  };

  if (loading) return <p>Loading...</p>;
  if (!coupon) return <p>Coupon not found.</p>;

  return (
    <div>
      <h1>{coupon.title}</h1>
      <p><strong>Code:</strong> {coupon.code}</p>
      <p><strong>Store:</strong> {coupon.store}</p>
      <p><strong>Category:</strong> {coupon.category}</p>
      {coupon.description && <p>{coupon.description}</p>}
      {coupon.expiresAt && <p><strong>Expires:</strong> {new Date(coupon.expiresAt).toLocaleDateString()}</p>}
      <button onClick={handleDelete}>Delete</button>
      <button onClick={() => navigate("/")}>Back</button>
    </div>
  );
}
