const mockSend = jest.fn().mockResolvedValue({});

jest.mock("@aws-sdk/client-sns", () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PublishCommand: jest.fn((args) => ({ type: "PublishCommand", args })),
}));

const { handler } = require("../signup-notification.ts");
const { PublishCommand } = require("@aws-sdk/client-sns");

function makeEvent({
  triggerSource = "PostConfirmation_ConfirmSignUp",
  email = "test@example.com",
  name = "",
} = {}) {
  return {
    triggerSource,
    request: { userAttributes: { email, ...(name ? { name } : {}) } },
    response: {},
  };
}

describe("signup-notification handler", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    jest.clearAllMocks();
  });

  it("publishes an SNS message on PostConfirmation_ConfirmSignUp", async () => {
    const event = makeEvent({ email: "alice@example.com" });
    await handler(event);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const publishArg = PublishCommand.mock.calls[0][0];
    expect(publishArg.Message).toContain("alice@example.com");
    expect(publishArg.Subject).toBe("New Vaulty signup");
  });

  it("includes the user's name in the message when provided", async () => {
    const event = makeEvent({ email: "bob@example.com", name: "Bob Smith" });
    await handler(event);
    const publishArg = PublishCommand.mock.calls[0][0];
    expect(publishArg.Message).toContain("Bob Smith");
  });

  it("does not publish SNS for other Cognito trigger sources", async () => {
    const event = makeEvent({ triggerSource: "PostConfirmation_ConfirmForgotPassword" });
    await handler(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns the event object unmodified (Cognito requirement)", async () => {
    const event = makeEvent();
    const result = await handler(event);
    expect(result).toBe(event);
  });

  it("returns the event even when triggerSource is unrecognized", async () => {
    const event = makeEvent({ triggerSource: "SomethingElse" });
    const result = await handler(event);
    expect(result).toBe(event);
  });

  it("swallows SNS errors and still returns the event", async () => {
    mockSend.mockRejectedValueOnce(new Error("SNS unavailable"));
    const event = makeEvent({ email: "carol@example.com" });
    const result = await handler(event);
    expect(result).toBe(event); // Must not throw
  });

  it("uses 'unknown' as email fallback when userAttributes is missing", async () => {
    const event = { triggerSource: "PostConfirmation_ConfirmSignUp", request: {}, response: {} };
    await handler(event);
    const publishArg = PublishCommand.mock.calls[0][0];
    expect(publishArg.Message).toContain("unknown");
  });
});
