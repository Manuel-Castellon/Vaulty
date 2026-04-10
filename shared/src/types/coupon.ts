/** Manual lifecycle state. Treat undefined (legacy records) as "active". */
export type CouponStatus = "active" | "used" | "archived" | "expired";

export interface Coupon {
  id: string;
  userId: string;
  itemType: "coupon" | "voucher";
  code: string;
  title: string;
  description?: string;
  discount?: DiscountValue;       // coupons only — absent on item/credit vouchers
  faceValue?: number;             // credit vouchers: what you can spend
  cost?: number;                  // credit vouchers: what you paid
  currency?: string;              // currency for faceValue/cost
  store: string;
  category: CouponCategory;
  expiresAt?: string;             // ISO 8601
  issueDate?: string;             // ISO 8601 — when the voucher was issued
  eventDate?: string;             // tickets: the actual event date (ISO 8601)
  seatInfo?: string;              // tickets: e.g. "Row 7, Seats 1-2"
  conditions?: string;            // usage restrictions / terms
  status?: CouponStatus;          // manual lifecycle; undefined means "active"
  /** @deprecated Use status instead */
  isActive: boolean;
  usageCount: number;
  maxUsage?: number;
  quantity?: number;              // number of items/tickets this voucher covers
  amountUsed?: number;            // for fixed/credit: how much has been redeemed
  imageUrl?: string;
  qrCode?: string;
  qrImageS3Key?: string;          // S3 key for cropped QR code image from extraction
  qrImageUrl?: string;            // presigned GET URL for qrImageS3Key (computed at read time, not stored)
  extractionWarnings?: string[];  // warnings produced during AI/OCR extraction
  createdAt: string;
  updatedAt: string;
}

export type DiscountValue =
  | { type: "percentage"; value: number }
  | { type: "fixed"; value: number; currency: string };

export type CouponCategory =
  | "food"
  | "retail"
  | "travel"
  | "entertainment"
  | "health"
  | "tech"
  | "other";

export interface CreateCouponInput {
  itemType?: "coupon" | "voucher";
  code: string;
  title: string;
  description?: string;
  discount?: DiscountValue;
  faceValue?: number;
  cost?: number;
  currency?: string;
  store: string;
  category?: CouponCategory;
  expiresAt?: string;
  issueDate?: string;
  eventDate?: string;
  seatInfo?: string;
  conditions?: string;
  status?: CouponStatus;
  maxUsage?: number;
  quantity?: number;
  imageUrl?: string;
  qrCode?: string;
  qrImageS3Key?: string;
  extractionWarnings?: string[];
}

export interface UpdateCouponInput extends Partial<CreateCouponInput> {
  /** @deprecated Use status instead */
  isActive?: boolean;
  amountUsed?: number;
}

export interface CouponListResponse {
  items: Coupon[];
  nextToken?: string;
}
