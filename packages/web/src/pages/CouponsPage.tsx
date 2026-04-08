import { Link } from "react-router-dom";
import { useCoupons } from "../hooks/useCoupons";
import styles from "./coupons.module.css";

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

export default function CouponsPage() {
  const { coupons, loading, error, deleteCoupon } = useCoupons();

  if (loading) return <p className={styles.center}>Loading your coupons…</p>;
  if (error) return <p className={styles.errorText}>Error: {error}</p>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Coupons</h1>
        <Link to="/add" className={styles.addBtn}>+ Add Coupon</Link>
      </div>

      {coupons.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No coupons yet</p>
          <p className={styles.emptyText}>Start saving by adding your first coupon.</p>
          <Link to="/add" className={styles.emptyLink}>Add a coupon →</Link>
        </div>
      ) : (
        <ul className={styles.grid}>
          {coupons.map((coupon) => {
            const isExpired = coupon.expiresAt
              ? new Date(coupon.expiresAt) < new Date()
              : false;
            const days = coupon.expiresAt ? daysUntilExpiry(coupon.expiresAt) : null;
            const expiringSoon = days !== null && days > 0 && days <= 7;

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
                    {coupon.expiresAt ? (
                      isExpired ? (
                        <span className={styles.expiry}>
                          Expired {new Date(coupon.expiresAt).toLocaleDateString()}
                        </span>
                      ) : expiringSoon ? (
                        <span className={styles.expiryWarn}>
                          Expires in {days} day{days !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className={styles.expiry}>
                          Expires {new Date(coupon.expiresAt).toLocaleDateString()}
                        </span>
                      )
                    ) : (
                      <span className={styles.expiry}>No expiry</span>
                    )}
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
