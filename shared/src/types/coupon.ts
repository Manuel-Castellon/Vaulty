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
}

export interface UpdateCouponInput extends Partial<CreateCouponInput> {
  isActive?: boolean;
}

export interface CouponListResponse {
  items: Coupon[];
  nextToken?: string;
}
