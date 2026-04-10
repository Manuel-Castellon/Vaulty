import { api } from "./api";

vi.mock("./auth", () => ({
  getIdToken: vi.fn().mockResolvedValue("token"),
}));

describe("web api extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("normalizes legacy extraction responses", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        itemType: "voucher",
        title: "Legacy Voucher",
        store: "Dominos",
      }),
    } as Response);

    const response = await api.ai.extract({ text: "voucher" });

    expect(response).toEqual({
      extraction: {
        itemType: "voucher",
        title: "Legacy Voucher",
        store: "Dominos",
      },
    });
  });

  test("passes through the new extraction envelope", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        extraction: {
          itemType: "coupon",
          title: "Modern Coupon",
        },
        warnings: ["language_validation_failed"],
      }),
    } as Response);

    const response = await api.ai.extract({ text: "coupon" });

    expect(response).toEqual({
      extraction: {
        itemType: "coupon",
        title: "Modern Coupon",
      },
      warnings: ["language_validation_failed"],
    });
  });
});
