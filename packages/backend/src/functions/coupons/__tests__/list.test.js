jest.mock("@aws-sdk/lib-dynamodb", () => ({
  QueryCommand: jest.fn((args) => ({ type: "QueryCommand", args })),
}));

jest.mock("../../../lib/dynamodb", () => ({
  ddb: { send: jest.fn() },
  TABLE_NAME: "coupons-test",
}));

const { handler } = require("../list.ts");
const { ddb } = require("../../../lib/dynamodb");

function makeEvent({ userId = "user-1", params = {} } = {}) {
  return {
    httpMethod: "GET",
    queryStringParameters: params,
    requestContext: { authorizer: { claims: { sub: userId } } },
  };
}

describe("list handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only coupon items, excluding NOTIFICATION_PREFS", async () => {
    ddb.send.mockResolvedValue({
      Items: [
        { userId: "user-1", id: "coupon-abc", store: "Nike", status: "active" },
        { userId: "user-1", id: "NOTIFICATION_PREFS", enabled: true, daysBeforeExpiry: 3 },
      ],
    });

    const res = await handler(makeEvent(), {}, () => {});
    const body = JSON.parse(res.body);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("coupon-abc");
  });

  it("returns only coupon items, excluding PUSH_TOKEN", async () => {
    ddb.send.mockResolvedValue({
      Items: [
        { userId: "user-1", id: "coupon-xyz", store: "Zara", status: "active" },
        { userId: "user-1", id: "PUSH_TOKEN", expoPushToken: "ExponentPushToken[xxx]" },
      ],
    });

    const res = await handler(makeEvent(), {}, () => {});
    const body = JSON.parse(res.body);

    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("coupon-xyz");
  });

  it("excludes both NOTIFICATION_PREFS and PUSH_TOKEN when both present", async () => {
    ddb.send.mockResolvedValue({
      Items: [
        { userId: "user-1", id: "PUSH_TOKEN", expoPushToken: "ExponentPushToken[yyy]" },
        { userId: "user-1", id: "NOTIFICATION_PREFS", enabled: false, daysBeforeExpiry: 1 },
        { userId: "user-1", id: "coupon-1", store: "Adidas", status: "active" },
        { userId: "user-1", id: "coupon-2", store: "Puma", status: "used" },
      ],
    });

    const res = await handler(makeEvent(), {}, () => {});
    const body = JSON.parse(res.body);

    expect(body.items).toHaveLength(2);
    expect(body.items.map((i) => i.id)).toEqual(["coupon-1", "coupon-2"]);
  });

  it("defaults status to active for legacy items without status field", async () => {
    ddb.send.mockResolvedValue({
      Items: [{ userId: "user-1", id: "coupon-old", store: "Gap" }],
    });

    const res = await handler(makeEvent(), {}, () => {});
    const body = JSON.parse(res.body);

    expect(body.items[0].status).toBe("active");
  });
});
