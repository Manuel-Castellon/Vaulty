import { useState, useEffect } from "react";
import type { Coupon } from "@coupon/shared";
import { api } from "../services/api";

export function useCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.coupons
      .list()
      .then((res) => setCoupons(res.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const deleteCoupon = async (id: string) => {
    await api.coupons.delete(id);
    setCoupons((prev) => prev.filter((c) => c.id !== id));
  };

  return { coupons, loading, error, deleteCoupon };
}
