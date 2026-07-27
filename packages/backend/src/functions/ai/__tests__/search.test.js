jest.mock("@aws-sdk/lib-dynamodb", () => ({
  QueryCommand: jest.fn((args) => ({ type: "QueryCommand", args })),
}));

jest.mock("../../../lib/dynamodb", () => ({
  ddb: { send: jest.fn() },
  TABLE_NAME: "coupons-test",
}));

const { handler } = require("../search.ts");
const { ddb } = require("../../../lib/dynamodb");
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

function makeEvent({ userId = "user-1", query = "pizza" } = {}) {
  return {
    body: JSON.stringify({ query }),
    requestContext: { authorizer: { claims: { sub: userId } } },
  };
}

function geminiResponse(text) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

describe("search handler", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  it("excludes system records from the DynamoDB query", async () => {
    ddb.send.mockResolvedValue({
      Items: [{ userId: "user-1", id: "coupon-abc", store: "Dominos" }],
    });
    global.fetch.mockResolvedValueOnce(geminiResponse('["coupon-abc"]'));

    await handler(makeEvent(), {}, () => {});

    const { args } = QueryCommand.mock.results[0].value;
    expect(args.FilterExpression).toBe("id <> :pushToken AND id <> :prefs");
    expect(args.ExpressionAttributeValues[":pushToken"]).toBe("PUSH_TOKEN");
    expect(args.ExpressionAttributeValues[":prefs"]).toBe("NOTIFICATION_PREFS");
  });

  it("never sends a push token to the AI provider", async () => {
    // Defence in depth: even if a system record reached the handler, it must
    // not be serialised into the prompt.
    ddb.send.mockResolvedValue({
      Items: [
        { userId: "user-1", id: "coupon-abc", store: "Dominos" },
        { userId: "user-1", id: "PUSH_TOKEN", expoPushToken: "ExponentPushToken[secret]" },
      ],
    });
    global.fetch.mockResolvedValueOnce(geminiResponse('["coupon-abc"]'));

    const res = await handler(makeEvent(), {}, () => {});

    const promptBody = global.fetch.mock.calls[0][1].body;
    expect(promptBody).not.toContain("ExponentPushToken");
    expect(promptBody).not.toContain("expoPushToken");

    const body = JSON.parse(res.body);
    expect(body.items.every((i) => i.id !== "PUSH_TOKEN")).toBe(true);
  });

  it("returns items in the order the model ranked them", async () => {
    ddb.send.mockResolvedValue({
      Items: [
        { userId: "user-1", id: "a", store: "Zara" },
        { userId: "user-1", id: "b", store: "Nike" },
      ],
    });
    global.fetch.mockResolvedValueOnce(geminiResponse('["b","a"]'));

    const res = await handler(makeEvent(), {}, () => {});
    const body = JSON.parse(res.body);

    expect(body.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("drops ids the model invented", async () => {
    ddb.send.mockResolvedValue({
      Items: [{ userId: "user-1", id: "a", store: "Zara" }],
    });
    global.fetch.mockResolvedValueOnce(geminiResponse('["a","hallucinated-id"]'));

    const res = await handler(makeEvent(), {}, () => {});
    const body = JSON.parse(res.body);

    expect(body.items.map((i) => i.id)).toEqual(["a"]);
  });

  it("short-circuits without calling the provider when the user has no items", async () => {
    ddb.send.mockResolvedValue({ Items: [] });

    const res = await handler(makeEvent(), {}, () => {});
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.items).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty query with a 400", async () => {
    const res = await handler(makeEvent({ query: "   " }), {}, () => {});

    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request with a 401", async () => {
    const res = await handler(
      { body: JSON.stringify({ query: "pizza" }), requestContext: {} },
      {},
      () => {}
    );

    expect(res.statusCode).toBe(401);
  });
});
