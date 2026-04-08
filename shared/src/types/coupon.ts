export interface Coupon {
  id: string;
  userId: string;
  code: string;
  title: string;
  description?: string;
  discount: DiscountValue;
  store: string;
  category: CouponCategory;
  expiresAt?: string; // ISO 8601
  isActive: boolean;
  usageCount: number;
  maxUsage?: number;
  amountUsed?: number; // for fixed-value coupons: how much of discount.value has been used
  imageUrl?: string;   // S3 URL of the coupon image
  qrCode?: string;     // QR code data or URL extracted from the coupon
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
  code: string;
  title: string;
  description?: string;
  discount: DiscountValue;
  store: string;
  category: CouponCategory;
  expiresAt?: string;
  maxUsage?: number;
  imageUrl?: string;
  qrCode?: string;
}

export interface UpdateCouponInput extends Partial<CreateCouponInput> {
  isActive?: boolean;
  amountUsed?: number;
}

export interface CouponListResponse {
  items: Coupon[];
  nextToken?: string;
}
