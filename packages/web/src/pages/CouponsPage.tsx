import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useCoupons } from "../hooks/useCoupons";
import type { Coupon, CouponCategory } from "@coupon/shared";
import { api } from "../services/api";
import styles from "./coupons.module.css";

const CATEGORIES: CouponCategory[] = [
  "food", "retail", "travel", "entertainment", "health", "tech", "other",
];

function formatValue(coupon: Coupon): string | null {
  if (coupon.discount) {
    if (coupon.discount.type === "percentage") return `${coupon.discount.value}% OFF`;
    return `${coupon.discount.currency} ${coupon.discount.value} OFF`;
  }
  if (coupon.faceValue) {
    const cur = coupon.currency ?? "";
    return `${cur} ${coupon.faceValue} value`.trim();
  }
  return null;
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
type ItemTypeFilter = "all" | "coupon" | "voucher";

export default function CouponsPage() {
  const { coupons, loading, error, deleteCoupon } = useCoupons();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Coupon[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CouponCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("expiry");

  // Debounced AI search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.ai.search({ query: searchQuery.trim() });
        setSearchResults(res.items);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  const filtered = useMemo(() => {
    // In search mode, show ranked results without further filtering
    if (searchResults !== null) return searchResults;

    let result = [...coupons];

    if (itemTypeFilter !== "all") {
      result = result.filter((c) => c.itemType === itemTypeFilter);
    }

    if (categoryFilter !== "all") {
      result = result.filter((c) => c.category === categoryFilter);
    }

    if (statusFilter === "active") {
      result = result.filter((c) => !c.expiresAt || new Date(c.expiresAt) >= new Date());
    } else if (statusFilter === "expired") {
      result = result.filter((c) => c.expiresAt && new Date(c.expiresAt) < new Date());
    }

    result.sort((a, b) => {
      if (sortBy === "expiry") {
        if (!a.expiresAt && !b.expiresAt) return 0;
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return result;
  }, [coupons, itemTypeFilter, categoryFilter, statusFilter, sortBy]);

  if (loading) return <p className={styles.center}>Loading your vault…</p>;
  if (error) return <p className={styles.errorText}>Error: {error}</p>;

  const isSearching = searchQuery.trim().length > 0;
  const emptyAll = filtered.length === 0 && coupons.length === 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Vault</h1>
        <Link to="/add" className={styles.addBtn}>+ Add</Link>
      </div>

      {/* Search bar */}
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={'Search \u2014 try \u201cpizza vouchers\u201d or \u201cexpiring soon\u201d\u2026'}
        />
        {searching && <span className={styles.searchSpinner}>Searching…</span>}
      </div>

      {/* Item type tabs + filters — hidden while searching */}
      {!isSearching && (
        <>
          <div className={styles.typeTabs}>
            {(["all", "coupon", "voucher"] as ItemTypeFilter[]).map((t) => (
              <button
                key={t}
                className={`${styles.typeTab}${itemTypeFilter === t ? ` ${styles.typeTabActive}` : ""}`}
                onClick={() => setItemTypeFilter(t)}
              >
                {t === "all" ? "All" : t === "coupon" ? "Coupons" : "Vouchers"}
              </button>
            ))}
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
        </>
      )}

      {emptyAll ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing saved yet</p>
          <p className={styles.emptyText}>Add your first coupon or voucher.</p>
          <Link to="/add" className={styles.emptyLink}>Add one →</Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {isSearching ? "No matches found" : "No items match your filters"}
          </p>
          <p className={styles.emptyText}>
            {isSearching ? "Try a different search." : "Try adjusting the type, category, or status filter."}
          </p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {filtered.map((coupon) => {
            const isExpired = coupon.expiresAt
              ? new Date(coupon.expiresAt) < new Date()
              : false;
            const expiry = expiryLabel(coupon.expiresAt);
            const value = formatValue(coupon);
            const isVoucher = coupon.itemType === "voucher";

            return (
              <li
                key={coupon.id}
                className={`${styles.card}${isExpired ? ` ${styles.cardExpired}` : ""}${isVoucher ? ` ${styles.cardVoucher}` : ""}`}
              >
                <Link to={`/coupons/${coupon.id}`} className={styles.cardLink}>
                  <div className={styles.cardTop}>
                    <h2 className={styles.cardTitle}>{coupon.title}</h2>
                    <span className={`${styles.badge}${isExpired ? ` ${styles.badgeExpired}` : isVoucher ? ` ${styles.badgeVoucher}` : ""}`}>
                      {isExpired ? "Expired" : isVoucher ? "Voucher" : coupon.category}
                    </span>
                  </div>
                  <p className={styles.cardStore}>{coupon.store}</p>
                  {value && <p className={styles.discount}>{value}</p>}
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
