import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useCoupons } from "../hooks/useCoupons";
import type { CouponCategory } from "@coupon/shared";
import styles from "./coupons.module.css";

const CATEGORIES: CouponCategory[] = [
  "food", "retail", "travel", "entertainment", "health", "tech", "other",
];

function formatDiscount(coupon: { discount: { type: string; value: number; currency?: string } }): string {
  if (coupon.discount.type === "percentage") {
    return `${coupon.discount.value}% OFF`;
  }
  return `${coupon.discount.currency ?? "USD"} ${coupon.discount.value} OFF`;
}

function daysUntilExpiry(expiresAt: string): number {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

function expiryLabel(expiresAt: string | undefined): { text: string; warn: boolean; expired: boolean } {
  if (!expiresAt) return { text: "No expiry", warn: false, expired: false };
  const days = daysUntilExpiry(expiresAt);
  if (days < 0) return { text: `Expired ${new Date(expiresAt).toLocaleDateString()}`, warn: false, expired: true };
  if (days === 0) return { text: "Expires today!", warn: true, expired: false };
  if (days <= 7) return { text: `Expires in ${days} day${days !== 1 ? "s" : ""}`, warn: true, expired: false };
  return { text: `Expires ${new Date(expiresAt).toLocaleDateString()}`, warn: false, expired: false };
}

type SortOption = "expiry" | "added";
type StatusFilter = "all" | "active" | "expired";

export default function CouponsPage() {
  const { coupons, loading, error, deleteCoupon } = useCoupons();

  const [categoryFilter, setCategoryFilter] = useState<CouponCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("expiry");

  const filtered = useMemo(() => {
    let result = [...coupons];

    // Filter by category
    if (categoryFilter !== "all") {
      result = result.filter((c) => c.category === categoryFilter);
    }

    // Filter by status
    if (statusFilter === "active") {
      result = result.filter((c) => !c.expiresAt || new Date(c.expiresAt) >= new Date());
    } else if (statusFilter === "expired") {
      result = result.filter((c) => c.expiresAt && new Date(c.expiresAt) < new Date());
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "expiry") {
        // No expiry goes to the end
        if (!a.expiresAt && !b.expiresAt) return 0;
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }
      // Sort by date added (createdAt desc — newest first)
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return result;
  }, [coupons, categoryFilter, statusFilter, sortBy]);

  if (loading) return <p className={styles.center}>Loading your coupons…</p>;
  if (error) return <p className={styles.errorText}>Error: {error}</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Coupons</h1>
        <Link to="/add" className={styles.addBtn}>+ Add Coupon</Link>
      </div>

      {coupons.length > 0 && (
        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Category</label>
            <select
              className={styles.filterSelect}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CouponCategory | "all")}
            >
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Status</label>
            <div className={styles.toggleGroup}>
              {(["all", "active", "expired"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  className={`${styles.toggleBtn}${statusFilter === s ? ` ${styles.toggleBtnActive}` : ""}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Sort by</label>
            <select
              className={styles.filterSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="expiry">Expiry (soonest first)</option>
              <option value="added">Date added (newest first)</option>
            </select>
          </div>
        </div>
      )}

      {filtered.length === 0 && coupons.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No coupons yet</p>
          <p className={styles.emptyText}>Start saving by adding your first coupon.</p>
          <Link to="/add" className={styles.emptyLink}>Add a coupon →</Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No coupons match your filters</p>
          <p className={styles.emptyText}>Try adjusting the category or status filter.</p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {filtered.map((coupon) => {
            const isExpired = coupon.expiresAt
              ? new Date(coupon.expiresAt) < new Date()
              : false;
            const expiry = expiryLabel(coupon.expiresAt);

            return (
              <li key={coupon.id} className={`${styles.card}${isExpired ? ` ${styles.cardExpired}` : ""}`}>
                <Link to={`/coupons/${coupon.id}`} className={styles.cardLink}>
                  <div className={styles.cardTop}>
                    <h2 className={styles.cardTitle}>{coupon.title}</h2>
                    <span className={`${styles.badge}${isExpired ? ` ${styles.badgeExpired}` : ""}`}>
                      {isExpired ? "Expired" : coupon.category}
                    </span>
                  </div>
                  <p className={styles.cardStore}>{coupon.store}</p>
                  <p className={styles.discount}>{formatDiscount(coupon)}</p>
                  <div className={styles.cardMeta}>
                    <span className={expiry.expired ? styles.expiry : expiry.warn ? styles.expiryWarn : styles.expiry}>
                      {expiry.text}
                    </span>
                  </div>
                </Link>
                <div className={styles.cardFooter}>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => deleteCoupon(coupon.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
