// Mock AWS SDK commands so they don't throw when instantiated in tests
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  GetCommand: jest.fn((args) => ({ type: "GetCommand", args })),
  PutCommand: jest.fn((args) => ({ type: "PutCommand", args })),
}));

// Mock the DynamoDB client
jest.mock("../../../lib/dynamodb", () => ({
  ddb: { send: jest.fn() },
  TABLE_NAME: "coupons-test",
}));

const { handler, getPrefs } = require("../preferences.ts");
const { ddb } = require("../../../lib/dynamodb");

function makeEvent({ method = "GET", body = null, userId = "user-123" } = {}) {
  return {
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    requestContext: { authorizer: { claims: { sub: userId } } },
  };
}

describe("notification preferences handler", () => {
  beforeEach(() => {
    ddb.send.mockReset();
  });

  describe("GET /notifications/preferences", () => {
    it("returns default prefs when no item exists in DynamoDB", async () => {
      ddb.send.mockResolvedValue({ Item: undefined });
      const res = await handler(makeEvent({ method: "GET" }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ enabled: true, daysBeforeExpiry: 3 });
    });

    it("returns stored prefs when item exists", async () => {
      ddb.send.mockResolvedValue({
        Item: { userId: "user-123", id: "NOTIFICATION_PREFS", enabled: false, daysBeforeExpiry: 7 },
      });
      const res = await handler(makeEvent({ method: "GET" }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ enabled: false, daysBeforeExpiry: 7 });
    });

    it("returns 400 when userId is missing", async () => {
      const event = { httpMethod: "GET", body: null, requestContext: { authorizer: null } };
      const res = await handler(event);
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /notifications/preferences", () => {
    it("saves and returns updated prefs", async () => {
      // First call: GetCommand (current prefs)
      ddb.send
        .mockResolvedValueOnce({ Item: { enabled: true, daysBeforeExpiry: 3 } })
        // Second call: PutCommand
        .mockResolvedValueOnce({});

      const res = await handler(makeEvent({ method: "PUT", body: { enabled: false } }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ enabled: false, daysBeforeExpiry: 3 });
    });

    it("clamps daysBeforeExpiry to 1–30", async () => {
      ddb.send
        .mockResolvedValueOnce({ Item: { enabled: true, daysBeforeExpiry: 3 } })
        .mockResolvedValueOnce({});

      const res = await handler(makeEvent({ method: "PUT", body: { daysBeforeExpiry: 999 } }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.daysBeforeExpiry).toBe(30);
    });

    it("clamps daysBeforeExpiry minimum to 1", async () => {
      ddb.send
        .mockResolvedValueOnce({ Item: { enabled: true, daysBeforeExpiry: 3 } })
        .mockResolvedValueOnce({});

      const res = await handler(makeEvent({ method: "PUT", body: { daysBeforeExpiry: 0 } }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.daysBeforeExpiry).toBe(1);
    });

    it("returns 400 for invalid JSON body", async () => {
      const event = {
        httpMethod: "PUT",
        body: "not-json",
        requestContext: { authorizer: { claims: { sub: "user-123" } } },
      };
      const res = await handler(event);
      expect(res.statusCode).toBe(400);
    });
  });
});

describe("getPrefs helper", () => {
  beforeEach(() => {
    ddb.send.mockReset();
  });

  it("returns defaults when DynamoDB throws", async () => {
    ddb.send.mockRejectedValue(new Error("DynamoDB error"));
    const prefs = await getPrefs("user-xyz");
    expect(prefs).toEqual({ enabled: true, daysBeforeExpiry: 3 });
  });

  it("returns defaults when item is missing", async () => {
    ddb.send.mockResolvedValue({ Item: undefined });
    const prefs = await getPrefs("user-xyz");
    expect(prefs).toEqual({ enabled: true, daysBeforeExpiry: 3 });
  });

  it("fills in defaults for missing fields in stored item", async () => {
    ddb.send.mockResolvedValue({ Item: { daysBeforeExpiry: 10 } });
    const prefs = await getPrefs("user-xyz");
    expect(prefs.enabled).toBe(true); // default
    expect(prefs.daysBeforeExpiry).toBe(10);
  });

  it("returns stored enabled=false correctly", async () => {
    ddb.send.mockResolvedValue({ Item: { enabled: false, daysBeforeExpiry: 7 } });
    const prefs = await getPrefs("user-xyz");
    expect(prefs.enabled).toBe(false);
    expect(prefs.daysBeforeExpiry).toBe(7);
  });
});
