export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface PaginationParams {
  limit?: number;
  nextToken?: string;
}

/** Fields returned by the AI extraction endpoint — all optional, user reviews before saving */
export interface ExtractionResult {
  title?: string;
  store?: string;
  itemType?: "coupon" | "voucher";
  discount?: import("./coupon").DiscountValue;
  faceValue?: number;
  cost?: number;
  currency?: string;
  code?: string;
  expiresAt?: string;
  eventDate?: string;
  seatInfo?: string;
  conditions?: string;
  quantity?: number;
  category?: import("./coupon").CouponCategory;
  description?: string;
}

export interface SearchRequest {
  query: string;
}

export interface RegisterTokenRequest {
  token: string;
}

export interface ExtractRequest {
  /** Base64-encoded file content */
  data?: string;
  /** MIME type of the file, e.g. "application/pdf", "image/jpeg" */
  mimeType?: string;
  /** Raw text to extract from (email paste, etc.) */
  text?: string;
}
