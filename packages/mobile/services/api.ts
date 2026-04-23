import type {
  Coupon,
  CreateCouponInput,
  UpdateCouponInput,
  CouponListResponse,
  ExtractResponse,
  ExtractRequest,
  SearchRequest,
  RegisterTokenRequest,
  NotificationPreferences,
  UpdateNotificationPreferencesRequest,
  SharedCouponView,
  ShareCouponResponse,
  ClaimCouponResponse,
} from "@coupon/shared";
import { normalizeExtractResponse } from "@coupon/shared";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { getIdToken } = await import("./auth");
  const token = await getIdToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  pushTokens: {
    register: (req: RegisterTokenRequest) =>
      request<{ success: boolean }>("/push-token", {
        method: "POST",
        body: JSON.stringify(req),
      }),
  },
  ai: {
    extract: async (req: ExtractRequest) =>
      normalizeExtractResponse(
        await request<ExtractResponse | import("@coupon/shared").ExtractionResult>("/extract", {
          method: "POST",
          body: JSON.stringify(req),
        })
      ),
    search: (req: SearchRequest) =>
      request<CouponListResponse>("/search", {
        method: "POST",
        body: JSON.stringify(req),
      }),
  },
  coupons: {
    list: (params?: { limit?: number; nextToken?: string }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.nextToken) qs.set("nextToken", params.nextToken);
      return request<CouponListResponse>(`/coupons?${qs}`);
    },
    get: (id: string) => request<Coupon>(`/coupons/${id}`),
    create: (input: CreateCouponInput) =>
      request<Coupon>("/coupons", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: UpdateCouponInput) =>
      request<Coupon>(`/coupons/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/coupons/${id}`, { method: "DELETE" }),
  },
  notifications: {
    getPreferences: () =>
      request<NotificationPreferences>("/notifications/preferences"),
    updatePreferences: (prefs: UpdateNotificationPreferencesRequest) =>
      request<NotificationPreferences>("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      }),
  },
  sharing: {
    share: (id: string) => request<ShareCouponResponse>(`/coupons/${id}/share`, { method: "POST" }),
    revoke: (id: string) => request<{ revoked: boolean }>(`/coupons/${id}/share`, { method: "DELETE" }),
    getPreview: (shareToken: string): Promise<SharedCouponView> => {
      return fetch(`${BASE_URL}/shared/${shareToken}`).then((r) => {
        if (!r.ok) throw new Error("Share link not found or revoked");
        return r.json();
      });
    },
    claim: (shareToken: string) =>
      request<ClaimCouponResponse>(`/coupons/claim/${shareToken}`, { method: "POST" }),
  },
};
