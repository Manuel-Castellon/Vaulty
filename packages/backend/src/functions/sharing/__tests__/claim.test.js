jest.mock("@aws-sdk/lib-dynamodb", () => ({
  QueryCommand: jest.fn((args) => ({ type: "QueryCommand", args })),
  PutCommand: jest.fn((args) => ({ type: "PutCommand", args })),
  GetCommand: jest.fn((args) => ({ type: "GetCommand", args })),
}));

jest.mock("../../../lib/dynamodb", () => ({
  ddb: { send: jest.fn() },
  TABLE_NAME: "coupons-test",
}));

jest.mock("uuid", () => ({ v4: jest.fn(() => "new-coupon-id") }));

// Disable notifications by default so tests don't need to set up push-token mocks
jest.mock("../../notifications/preferences", () => ({
  getPrefs: jest.fn().mockResolvedValue({ enabled: true, daysBeforeExpiry: 3, notifyOnClaim: false }),
}));

const { handler } = require("../claim.ts");
const { ddb } = require("../../../lib/dynamodb");
const { getPrefs } = require("../../notifications/preferences");

const SHARE_TOKEN = "share-tok-abc";

const SOURCE_COUPON = {
  userId: "sharer-user",
  id: "source-coupon-id",
  shareToken: SHARE_TOKEN,
  title: "50% off pizza",
  store: "Pizza Place",
  code: "PIZZA50",
  category: "food",
  status: "active",
  imageUrl: "https://s3.example.com/sharer/image.jpg",
  qrImageS3Key: "sharer/qr.jpg",
  qrImageUrl: "https://s3.example.com/sharer/qr.jpg",
  usageCount: 2,
  amountUsed: 5,
};

function makeEvent({ userId = "recipient-user", shareToken = SHARE_TOKEN } = {}) {
  return {
    pathParameters: { shareToken },
    requestContext: { authorizer: { claims: { sub: userId } } },
  };
}

describe("claim handler", () => {
  beforeEach(() => {
    ddb.send.mockReset();
    getPrefs.mockResolvedValue({ enabled: true, daysBeforeExpiry: 3, notifyOnClaim: false });
  });

  it("returns 201 with a copy of the coupon assigned to the recipient", async () => {
    ddb.send
      .mockResolvedValueOnce({ Items: [SOURCE_COUPON] }) // QueryCommand (GSI)
      .mockResolvedValueOnce({}); // PutCommand

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(201);
    const { coupon } = JSON.parse(res.body);
    expect(coupon.id).toBe("new-coupon-id");
    expect(coupon.userId).toBe("recipient-user");
    expect(coupon.title).toBe("50% off pizza");
    expect(coupon.store).toBe("Pizza Place");
    expect(coupon.code).toBe("PIZZA50");
  });

  it("resets usageCount and amountUsed to zero in the copy", async () => {
    ddb.send
      .mockResolvedValueOnce({ Items: [SOURCE_COUPON] })
      .mockResolvedValueOnce({});

    const res = await handler(makeEvent());
    const { coupon } = JSON.parse(res.body);
    expect(coupon.usageCount).toBe(0);
    expect(coupon.amountUsed).toBe(0);
  });

  it("strips imageUrl, qrImageUrl, qrImageS3Key, and shareToken from the copy", async () => {
    ddb.send
      .mockResolvedValueOnce({ Items: [SOURCE_COUPON] })
      .mockResolvedValueOnce({});

    const res = await handler(makeEvent());
    const { coupon } = JSON.parse(res.body);
    expect(coupon).not.toHaveProperty("imageUrl");
    expect(coupon).not.toHaveProperty("qrImageUrl");
    expect(coupon).not.toHaveProperty("qrImageS3Key");
    expect(coupon).not.toHaveProperty("shareToken");
  });

  it("returns 401 when authorization is missing", async () => {
    const event = { pathParameters: { shareToken: SHARE_TOKEN }, requestContext: { authorizer: null } };
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when share token is not found", async () => {
    ddb.send.mockResolvedValueOnce({ Items: [] });
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when item exists but shareToken is absent (revoked)", async () => {
    const revokedCoupon = { ...SOURCE_COUPON };
    delete revokedCoupon.shareToken;
    ddb.send.mockResolvedValueOnce({ Items: [revokedCoupon] });
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when recipient tries to claim their own coupon", async () => {
    ddb.send.mockResolvedValueOnce({ Items: [SOURCE_COUPON] });

    // Recipient userId matches the source coupon's userId
    const res = await handler(makeEvent({ userId: "sharer-user" }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toMatch(/cannot claim your own/i);
  });

  it("returns 400 when shareToken path param is missing", async () => {
    const event = {
      pathParameters: {},
      requestContext: { authorizer: { claims: { sub: "recipient-user" } } },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when DynamoDB GSI query throws", async () => {
    ddb.send.mockRejectedValueOnce(new Error("GSI failure"));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
  });

  it("returns 500 when PutCommand throws", async () => {
    ddb.send
      .mockResolvedValueOnce({ Items: [SOURCE_COUPON] })
      .mockRejectedValueOnce(new Error("Put failure"));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
  });
});

describe("claim handler — sharer notification", () => {
  beforeEach(() => {
    ddb.send.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("calls Expo push API when notifyOnClaim is enabled and sharer has a push token", async () => {
    getPrefs.mockResolvedValue({ enabled: true, daysBeforeExpiry: 3, notifyOnClaim: true });

    ddb.send
      .mockResolvedValueOnce({ Items: [SOURCE_COUPON] }) // QueryCommand
      .mockResolvedValueOnce({}) // PutCommand
      .mockResolvedValueOnce({ Item: { expoPushToken: "ExponentPushToken[xxx]" } }); // GetCommand (PUSH_TOKEN)

    await handler(makeEvent());
    // Flush all pending micro-tasks so the fire-and-forget notification resolves
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.fetch).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not call Expo push API when notifyOnClaim is false", async () => {
    getPrefs.mockResolvedValue({ enabled: true, daysBeforeExpiry: 3, notifyOnClaim: false });

    ddb.send
      .mockResolvedValueOnce({ Items: [SOURCE_COUPON] })
      .mockResolvedValueOnce({});

    await handler(makeEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not crash the claim response when notification fails", async () => {
    getPrefs.mockResolvedValue({ enabled: true, daysBeforeExpiry: 3, notifyOnClaim: true });
    global.fetch = jest.fn().mockRejectedValue(new Error("push failed"));

    ddb.send
      .mockResolvedValueOnce({ Items: [SOURCE_COUPON] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { expoPushToken: "ExponentPushToken[yyy]" } });

    const res = await handler(makeEvent());
    // Claim succeeds regardless of notification failure
    expect(res.statusCode).toBe(201);
  });
});
