export function mergeExtraction<T extends Record<string, unknown>>(
  current: T,
  extracted: Partial<T>,
  emptyValues: T
): T {
  const next = { ...current };

  for (const key of Object.keys(extracted) as Array<keyof T>) {
    const value = extracted[key];
    const currentValue = current[key];
    const emptyValue = emptyValues[key];

    if (value === undefined) continue;
    if (currentValue === undefined || currentValue === null || currentValue === "" || currentValue === emptyValue) {
      next[key] = value;
    }
  }

  return next;
}

export function getExtractionSuggestion(
  currentItemType: "coupon" | "voucher",
  extractedItemType?: "coupon" | "voucher"
): "coupon" | "voucher" | null {
  if (!extractedItemType || extractedItemType === currentItemType) {
    return null;
  }

  return extractedItemType;
}
