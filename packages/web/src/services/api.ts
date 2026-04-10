import type {
  Coupon,
  CreateCouponInput,
  UpdateCouponInput,
  CouponListResponse,
  ExtractResponse,
  ExtractRequest,
  SearchRequest,
} from "@coupon/shared";
import { normalizeExtractResponse } from "@coupon/shared";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
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
};
