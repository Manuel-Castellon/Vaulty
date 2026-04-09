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
  eventDate?: string;             // tickets: the actual event date (ISO 8601)
  seatInfo?: string;              // tickets: e.g. "Row 7, Seats 1-2"
  conditions?: string;            // usage restrictions
  isActive: boolean;
  usageCount: number;
  maxUsage?: number;
  quantity?: number;              // number of items/tickets this voucher covers
  amountUsed?: number;            // for fixed/credit: how much has been redeemed
  imageUrl?: string;
  qrCode?: string;
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
  eventDate?: string;
  seatInfo?: string;
  conditions?: string;
  maxUsage?: number;
  quantity?: number;
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
