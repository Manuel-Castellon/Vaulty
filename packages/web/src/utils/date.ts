/** Formats an ISO date string as "10 Aug 2026" — unambiguous across all locales. */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
