import { APIGatewayProxyHandler } from "aws-lambda";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, notFound, badRequest, serverError, unauthorized } from "../../lib/response";

const SHARE_BASE_URL = process.env.SHARE_BASE_URL ?? "http://localhost:5173";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) return unauthorized();

  const id = event.pathParameters?.id;
  if (!id) return badRequest("Missing coupon id");

  // Verify the coupon exists and belongs to this user
  let item: Record<string, any> | undefined;
  try {
    const result = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId, id } })
    );
    item = result.Item;
  } catch (err) {
    console.error("[share] DynamoDB get error:", err);
    return serverError();
  }
  if (!item) return notFound("Coupon not found");

  if (event.httpMethod === "DELETE") {
    // Revoke sharing — remove the shareToken
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { userId, id },
          UpdateExpression: "REMOVE shareToken SET updatedAt = :now",
          ExpressionAttributeValues: { ":now": new Date().toISOString() },
          ConditionExpression: "attribute_exists(id)",
        })
      );
      return ok({ revoked: true });
    } catch (err) {
      console.error("[share] revoke error:", err);
      return serverError();
    }
  }

  // POST — generate or return existing share token (idempotent)
  if (item.shareToken) {
    return ok({
      shareUrl: `${SHARE_BASE_URL}/shared/${item.shareToken}`,
      shareToken: item.shareToken,
    });
  }

  const shareToken = randomBytes(16).toString("base64url");
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { userId, id },
        UpdateExpression: "SET shareToken = :token, updatedAt = :now",
        ExpressionAttributeValues: {
          ":token": shareToken,
          ":now": new Date().toISOString(),
        },
        ConditionExpression: "attribute_exists(id)",
      })
    );
  } catch (err) {
    console.error("[share] update error:", err);
    return serverError();
  }

  return ok({
    shareUrl: `${SHARE_BASE_URL}/shared/${shareToken}`,
    shareToken,
  });
};
