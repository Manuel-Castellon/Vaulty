const { handler, __resetQuotaCooldownForTests } = require("../extract.ts");

function createEvent(body) {
  return {
    body: JSON.stringify(body),
    requestContext: {},
  };
}

function geminiResponse(text) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

describe("extract handler", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = jest.fn();
    __resetQuotaCooldownForTests();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  test("returns extraction on first valid non-latin response", async () => {
    global.fetch.mockResolvedValueOnce(geminiResponse(JSON.stringify({
      sourceLanguage: "he",
      sourceScript: "hebrew",
      title: "פיצה משפחתית",
      store: "דומינוס",
      itemType: "voucher",
    })));

    const response = await handler(createEvent({ text: "שובר לפיצה" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({
      extraction: {
        sourceLanguage: "he",
        sourceScript: "hebrew",
        title: "פיצה משפחתית",
        store: "דומינוס",
        itemType: "voucher",
      },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("retries when first non-latin response is translated", async () => {
    global.fetch
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({
        sourceLanguage: "he",
        sourceScript: "hebrew",
        title: "Family Pizza",
        store: "Dominos",
      })))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({
        sourceLanguage: "he",
        sourceScript: "hebrew",
        title: "פיצה משפחתית",
        store: "דומינוס",
      })));

    const response = await handler(createEvent({ text: "שובר לדומינוס" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.extraction.title).toBe("פיצה משפחתית");
    expect(body.warnings).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][1].body).toContain("translated text to English");
  });

  test("returns warning when retry still violates script preservation", async () => {
    global.fetch
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({
        sourceLanguage: "he",
        sourceScript: "hebrew",
        title: "Family Pizza",
      })))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({
        sourceLanguage: "he",
        sourceScript: "hebrew",
        title: "Voucher",
      })));

    const response = await handler(createEvent({ text: "שובר" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.warnings).toEqual(["language_validation_failed"]);
    expect(body.extraction.title).toBe("Voucher");
  });

  test("hebrew document allows latin store brand without retry", async () => {
    global.fetch.mockResolvedValueOnce(geminiResponse(JSON.stringify({
      sourceLanguage: "he",
      sourceScript: "hebrew",
      title: "שובר ב-60 ₪ למימוש 100 ₪ באתר ובאפליקציית WOLT",
      store: "WOLT",
      itemType: "voucher",
    })));

    const response = await handler(createEvent({ text: "שובר וולט" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.extraction.store).toBe("WOLT");
    expect(body.warnings).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("latin documents do not retry", async () => {
    global.fetch.mockResolvedValueOnce(geminiResponse(JSON.stringify({
      sourceLanguage: "en",
      sourceScript: "latin",
      title: "Summer Sale",
      store: "Target",
    })));

    const response = await handler(createEvent({ text: "20% off" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.extraction.title).toBe("Summer Sale");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("missing sourceScript is treated as pass-through", async () => {
    global.fetch.mockResolvedValueOnce(geminiResponse(JSON.stringify({
      title: "Family Pizza",
      store: "Dominos",
    })));

    const response = await handler(createEvent({ text: "pizza voucher" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.extraction.store).toBe("Dominos");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("missing itemType remains undefined", async () => {
    global.fetch.mockResolvedValueOnce(geminiResponse(JSON.stringify({
      sourceLanguage: "en",
      sourceScript: "latin",
      title: "Ticket",
    })));

    const response = await handler(createEvent({ text: "event ticket" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.extraction.itemType).toBeUndefined();
  });

  test("invalid json returns 500", async () => {
    global.fetch.mockResolvedValueOnce(geminiResponse("not-json"));

    const response = await handler(createEvent({ text: "coupon" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.error.message).toBe("Failed to parse AI response");
  });

  test("quota exhaustion returns a manual entry message", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          status: "RESOURCE_EXHAUSTED",
          message: "quota hit",
        },
      }),
    });

    const response = await handler(createEvent({ text: "coupon" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.error.message).toContain("temporarily unavailable");
    expect(body.error.message).toContain("manually");
  });

  test("quota exhaustion includes retry delay when available", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          status: "RESOURCE_EXHAUSTED",
          message: "quota hit",
          details: [{ retryDelay: "31s" }],
        },
      }),
    });

    const response = await handler(createEvent({ text: "coupon" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.error.message).toContain("about 31 seconds");
  });

  test("repeated same request within cooldown is short-circuited", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          status: "RESOURCE_EXHAUSTED",
          message: "quota hit",
          details: [{ retryDelay: "20s" }],
        },
      }),
    });

    const event = createEvent({ text: "same request" });
    await handler(event);
    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.error.message).toContain("about");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("network fetch failure returns a manual entry message", async () => {
    global.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const response = await handler(createEvent({ text: "coupon" }));
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.error.message).toContain("temporarily unavailable");
    expect(body.error.message).toContain("manually");
  });
});
