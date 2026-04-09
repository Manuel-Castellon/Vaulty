import { APIGatewayProxyHandler } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, badRequest, serverError } from "../../lib/response";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) return badRequest("Unauthorized");

  let body: { token?: unknown };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return badRequest("Invalid JSON");
  }

  const { token } = body;
  if (!token || typeof token !== "string") return badRequest("token is required");

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          userId,
          id: "PUSH_TOKEN",
          expoPushToken: token,
          updatedAt: new Date().toISOString(),
        },
      })
    );
    return ok({ success: true });
  } catch (err) {
    console.error("[register-token] error:", err);
    return serverError();
  }
};
