import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCoupons } from "../hooks/useCoupons";
import type { Coupon, CouponCategory, CouponStatus } from "@coupon/shared";
import { api } from "../services/api";
import { formatDate } from "../utils/date";
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
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function expiryLabel(expiresAt: string | undefined): { text: string; warn: boolean; expired: boolean } {
  if (!expiresAt) return { text: "No expiry", warn: false, expired: false };
  const days = daysUntilExpiry(expiresAt);
  if (days < 0) return { text: `Expired ${formatDate(expiresAt)}`, warn: false, expired: true };
  if (days === 0) return { text: "Expires today!", warn: true, expired: false };
  if (days <= 7) return { text: `Expires in ${days} day${days !== 1 ? "s" : ""}`, warn: true, expired: false };
  return { text: `Expires ${formatDate(expiresAt)}`, warn: false, expired: false };
}

// Derives the effective display status, giving manual status priority over date-expiry
function effectiveStatus(coupon: Coupon): CouponStatus {
  const s = coupon.status ?? "active";
  if (s === "used" || s === "archived") return s;
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return "expired";
  return "active";
}

type SortOption = "expiry" | "added" | "merchant" | "category" | "status";
type StatusFilter = "all" | "active" | "used" | "archived" | "expired";
type ItemTypeFilter = "all" | "coupon" | "voucher";

const STATUS_ORDER: Record<CouponStatus, number> = { active: 0, used: 1, archived: 2, expired: 3 };

export default function CouponsPage() {
  const { coupons, loading, error, deleteCoupon } = useCoupons();
  const [searchParams] = useSearchParams();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Coupon[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialType = (searchParams.get("type") as ItemTypeFilter) ?? "all";
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>(
    ["all", "coupon", "voucher"].includes(initialType) ? initialType : "all"
  );
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
    if (searchResults !== null) return searchResults;

    let result = [...coupons];

    if (itemTypeFilter !== "all") {
      result = result.filter((c) => c.itemType === itemTypeFilter);
    }
    if (categoryFilter !== "all") {
      result = result.filter((c) => c.category === categoryFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => effectiveStatus(c) === statusFilter);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "expiry": {
          if (!a.expiresAt && !b.expiresAt) return 0;
          if (!a.expiresAt) return 1;
          if (!b.expiresAt) return -1;
          return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
        }
        case "added": {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        }
        case "merchant":
          return a.store.localeCompare(b.store);
        case "category":
          return a.category.localeCompare(b.category);
        case "status":
          return STATUS_ORDER[effectiveStatus(a)] - STATUS_ORDER[effectiveStatus(b)];
      }
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
                  {(["all", "active", "used", "archived", "expired"] as StatusFilter[]).map((s) => (
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
                  <option value="expiry">Expiring soon</option>
                  <option value="added">Newest first</option>
                  <option value="merchant">Merchant (A–Z)</option>
                  <option value="category">Category (A–Z)</option>
                  <option value="status">Status</option>
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
            const status = effectiveStatus(coupon);
            const isExpired = status === "expired";
            const isDimmed = status === "expired" || status === "used" || status === "archived";
            const expiry = expiryLabel(coupon.expiresAt);
            const value = formatValue(coupon);
            const isVoucher = coupon.itemType === "voucher";

            return (
              <li
                key={coupon.id}
                className={`${styles.card}${isDimmed ? ` ${styles.cardDimmed}` : ""}${isVoucher ? ` ${styles.cardVoucher}` : ""}`}
              >
                <Link to={`/coupons/${coupon.id}`} className={styles.cardLink}>
                  <div className={styles.cardTop}>
                    <h2 className={styles.cardTitle} dir="auto">{coupon.title}</h2>
                    <div className={styles.badgeRow}>
                      {/* Type / category badge — always shown */}
                      <span className={`${styles.badge}${isVoucher ? ` ${styles.badgeVoucher}` : ""}`}>
                        {isVoucher ? "Voucher" : coupon.category}
                      </span>
                      {/* Category badge for vouchers */}
                      {isVoucher && (
                        <span className={styles.badge}>{coupon.category}</span>
                      )}
                      {/* Status badge — only for non-active */}
                      {status !== "active" && (
                        <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={styles.cardStore} dir="auto">{coupon.store}</p>
                  {value && <p className={styles.discount}>{value}</p>}
                  <div className={styles.cardMeta}>
                    <span className={isExpired ? styles.expiryExpired : expiry.warn ? styles.expiryWarn : styles.expiry}>
                      {expiry.text}
                    </span>
                  </div>
                </Link>
                <div className={styles.cardFooter}>
                  {confirmDeleteId === coupon.id ? (
                    <>
                      <span className={styles.deleteConfirmText}>Delete?</span>
                      <button
                        className={styles.deleteConfirmBtn}
                        onClick={() => { deleteCoupon(coupon.id); setConfirmDeleteId(null); }}
                      >
                        Yes
                      </button>
                      <button
                        className={styles.deleteCancelBtn}
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setConfirmDeleteId(coupon.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
