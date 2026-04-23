export type { CouponStatus } from "./coupon";

export type SourceScript =
  | "latin"
  | "hebrew"
  | "arabic"
  | "cjk"
  | "cyrillic"
  | "other";

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
  sourceLanguage?: string;
  sourceScript?: SourceScript;
  discount?: import("./coupon").DiscountValue;
  faceValue?: number;
  cost?: number;
  currency?: string;
  code?: string;
  expiresAt?: string;
  issueDate?: string;
  eventDate?: string;
  seatInfo?: string;
  conditions?: string;
  quantity?: number;
  usageLimit?: string;
  category?: import("./coupon").CouponCategory;
  description?: string;
}

export interface ExtractResponse {
  extraction: ExtractionResult;
  /** S3 key of the cropped QR code image, if one was detected */
  qrImageS3Key?: string;
  /** Per-field confidence scores from the AI model (0.0–1.0) */
  confidencePerField?: Record<string, number>;
  warnings?: string[];
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
  /** S3 key if the file was already uploaded via presigned URL */
  s3Key?: string;
}

export interface NotificationPreferences {
  /** Whether expiry push notifications are enabled globally for this user */
  enabled: boolean;
  /** How many days before expiry to send the notification (1–30) */
  daysBeforeExpiry: number;
  /** Whether to receive a push notification when someone claims a coupon you shared */
  notifyOnClaim?: boolean;
}

export type UpdateNotificationPreferencesRequest = Partial<NotificationPreferences>;

/** Public view of a shared coupon — strips owner-specific and internal fields */
export type SharedCouponView = Omit<
  import("./coupon").Coupon,
  "userId" | "qrImageS3Key" | "isActive" | "usageCount" | "amountUsed" | "extractionWarnings" | "shareToken"
>;

export interface ShareCouponResponse {
  shareUrl: string;
  shareToken: string;
}

export interface ClaimCouponResponse {
  coupon: import("./coupon").Coupon;
}
