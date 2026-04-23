import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({ region: process.env.REGION ?? "us-east-1" });

export const handler = async (event: any) => {
  if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
    const email = event.request?.userAttributes?.email ?? "unknown";
    const name = event.request?.userAttributes?.name ?? "";
    try {
      await sns.send(
        new PublishCommand({
          TopicArn: process.env.SIGNUP_TOPIC_ARN,
          Subject: "New Vaulty signup",
          Message: [
            `Email: ${email}`,
            name ? `Name: ${name}` : null,
            `Time: ${new Date().toISOString()}`,
            `Stage: ${process.env.STAGE ?? "dev"}`,
          ]
            .filter(Boolean)
            .join("\n"),
        })
      );
    } catch (err) {
      // Never fail the Cognito flow — log and swallow
      console.error("[signup-notification] SNS publish failed:", err);
    }
  }
  // Cognito requires the event to be returned unmodified
  return event;
};
