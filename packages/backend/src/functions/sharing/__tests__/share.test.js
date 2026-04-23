jest.mock("@aws-sdk/lib-dynamodb", () => ({
  GetCommand: jest.fn((args) => ({ type: "GetCommand", args })),
  UpdateCommand: jest.fn((args) => ({ type: "UpdateCommand", args })),
}));

jest.mock("../../../lib/dynamodb", () => ({
  ddb: { send: jest.fn() },
  TABLE_NAME: "coupons-test",
}));

const { handler } = require("../share.ts");
const { ddb } = require("../../../lib/dynamodb");

function makeEvent({ method = "POST", id = "coupon-1", userId = "user-123" } = {}) {
  return {
    httpMethod: method,
    pathParameters: { id },
    requestContext: { authorizer: { claims: { sub: userId } } },
  };
}

const COUPON = { userId: "user-123", id: "coupon-1", store: "Nike", title: "10% off" };

describe("share handler — POST", () => {
  beforeEach(() => ddb.send.mockReset());

  it("generates a new shareToken and returns shareUrl", async () => {
    ddb.send
      .mockResolvedValueOnce({ Item: COUPON }) // GetCommand — no shareToken
      .mockResolvedValueOnce({}); // UpdateCommand

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.shareToken).toMatch(/^[\w-]{20,}$/); // base64url, 22 chars
    expect(body.shareUrl).toContain(`/shared/${body.shareToken}`);
  });

  it("is idempotent — returns existing shareToken without updating DynamoDB", async () => {
    const existingToken = "existing-token-abc";
    ddb.send.mockResolvedValueOnce({ Item: { ...COUPON, shareToken: existingToken } });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.shareToken).toBe(existingToken);
    expect(ddb.send).toHaveBeenCalledTimes(1); // no UpdateCommand
  });

  it("returns 404 when coupon does not exist", async () => {
    ddb.send.mockResolvedValueOnce({ Item: undefined });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
  });

  it("returns 401 when userId is missing", async () => {
    const event = { httpMethod: "POST", pathParameters: { id: "coupon-1" }, requestContext: { authorizer: null } };
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when path id is missing", async () => {
    const event = {
      httpMethod: "POST",
      pathParameters: {},
      requestContext: { authorizer: { claims: { sub: "user-123" } } },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when DynamoDB get throws", async () => {
    ddb.send.mockRejectedValueOnce(new Error("DynamoDB error"));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
  });
});

describe("share handler — DELETE (revoke)", () => {
  beforeEach(() => ddb.send.mockReset());

  it("revokes sharing and returns { revoked: true }", async () => {
    ddb.send
      .mockResolvedValueOnce({ Item: { ...COUPON, shareToken: "tok-123" } }) // GetCommand
      .mockResolvedValueOnce({}); // UpdateCommand (REMOVE shareToken)

    const res = await handler(makeEvent({ method: "DELETE" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.revoked).toBe(true);
  });

  it("returns 404 when coupon not found on revoke", async () => {
    ddb.send.mockResolvedValueOnce({ Item: undefined });
    const res = await handler(makeEvent({ method: "DELETE" }));
    expect(res.statusCode).toBe(404);
  });

  it("returns 401 on revoke when userId is missing", async () => {
    const event = { httpMethod: "DELETE", pathParameters: { id: "c1" }, requestContext: { authorizer: null } };
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });
});
