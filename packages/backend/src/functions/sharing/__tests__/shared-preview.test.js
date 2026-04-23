jest.mock("@aws-sdk/lib-dynamodb", () => ({
  QueryCommand: jest.fn((args) => ({ type: "QueryCommand", args })),
}));

jest.mock("../../../lib/dynamodb", () => ({
  ddb: { send: jest.fn() },
  TABLE_NAME: "coupons-test",
}));

const { handler } = require("../shared-preview.ts");
const { ddb } = require("../../../lib/dynamodb");

function makeEvent(shareToken = "tok-abc123") {
  return { pathParameters: { shareToken } };
}

const SOURCE_ITEM = {
  userId: "owner-user",
  id: "coupon-1",
  shareToken: "tok-abc123",
  title: "20% off",
  store: "Adidas",
  code: "SAVE20",
  category: "retail",
  status: "active",
  qrImageS3Key: "private/s3/path.jpg",
  isActive: true,
  usageCount: 5,
  amountUsed: 10,
  extractionWarnings: ["low confidence"],
  expiresAt: "2026-12-31",
};

describe("shared-preview handler", () => {
  beforeEach(() => ddb.send.mockReset());

  it("returns 200 with sanitized coupon view", async () => {
    ddb.send.mockResolvedValueOnce({ Items: [SOURCE_ITEM] });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.title).toBe("20% off");
    expect(body.store).toBe("Adidas");
    expect(body.code).toBe("SAVE20");
  });

  it("strips all private fields from the response", async () => {
    ddb.send.mockResolvedValueOnce({ Items: [SOURCE_ITEM] });

    const res = await handler(makeEvent());
    const body = JSON.parse(res.body);
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("qrImageS3Key");
    expect(body).not.toHaveProperty("isActive");
    expect(body).not.toHaveProperty("usageCount");
    expect(body).not.toHaveProperty("amountUsed");
    expect(body).not.toHaveProperty("extractionWarnings");
    expect(body).not.toHaveProperty("shareToken");
  });

  it("includes CORS header Access-Control-Allow-Origin: *", async () => {
    ddb.send.mockResolvedValueOnce({ Items: [SOURCE_ITEM] });

    const res = await handler(makeEvent());
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("returns 404 when share token is not found", async () => {
    ddb.send.mockResolvedValueOnce({ Items: [] });

    const res = await handler(makeEvent("nonexistent-token"));
    expect(res.statusCode).toBe(404);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("returns 404 when item has no shareToken (revoked)", async () => {
    const revokedItem = { ...SOURCE_ITEM };
    delete revokedItem.shareToken;
    ddb.send.mockResolvedValueOnce({ Items: [revokedItem] });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when path parameter is missing", async () => {
    const res = await handler({ pathParameters: {} });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when DynamoDB throws", async () => {
    ddb.send.mockRejectedValueOnce(new Error("GSI error"));

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
  });

  it("passes the correct token to the GSI query", async () => {
    ddb.send.mockResolvedValueOnce({ Items: [SOURCE_ITEM] });

    await handler(makeEvent("my-specific-token"));
    const sendArg = ddb.send.mock.calls[0][0];
    expect(sendArg.args.ExpressionAttributeValues[":token"]).toBe("my-specific-token");
  });
});
