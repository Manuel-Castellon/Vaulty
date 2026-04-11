import { formatDate } from "../date";

describe("formatDate", () => {
  it("formats a date as day-month-year with abbreviated month", () => {
    const result = formatDate("2026-08-10T00:00:00.000Z");
    expect(result).toMatch(/Aug/);
    expect(result).toMatch(/2026/);
  });

  it("does not use MM/DD/YYYY format", () => {
    const result = formatDate("2026-03-05T00:00:00.000Z");
    // Should not look like 3/5/2026 or 03/05/2026
    expect(result).not.toMatch(/^\d+\/\d+\/\d+$/);
    expect(result).toMatch(/Mar/);
  });

  it("is consistent regardless of numeric month ambiguity", () => {
    // Jan 02 vs Feb 01 — ensure month name is shown, not a number that could be either
    const jan2 = formatDate("2026-01-02T00:00:00.000Z");
    const feb1 = formatDate("2026-02-01T00:00:00.000Z");
    expect(jan2).toMatch(/Jan/);
    expect(feb1).toMatch(/Feb/);
  });
});
