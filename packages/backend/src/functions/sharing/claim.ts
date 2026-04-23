import { APIGatewayProxyHandler } from "aws-lambda";
import { QueryCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { created, notFound, badRequest, serverError, unauthorized } from "../../lib/response";
import type { Coupon } from "@coupon/shared";
import { getPrefs } from "../notifications/preferences";

const SHARE_TOKEN_INDEX = "shareToken-index";

async function getPushToken(userId: string): Promise<string | null> {
  try {
    const result = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId, id: "PUSH_TOKEN" } })
    );
    return (result.Item?.expoPushToken as string) ?? null;
  } catch {
    return null;
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const recipientUserId = event.requestContext.authorizer?.claims?.sub;
  if (!recipientUserId) return unauthorized();

  const shareToken = event.pathParameters?.shareToken;
  if (!shareToken) return badRequest("Missing share token");

  // Look up the source coupon via the GSI
  let source: Record<string, any> | undefined;
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: SHARE_TOKEN_INDEX,
        KeyConditionExpression: "shareToken = :token",
        ExpressionAttributeValues: { ":token": shareToken },
        Limit: 1,
      })
    );
    source = result.Items?.[0];
  } catch (err) {
    console.error("[claim] GSI query error:", err);
    return serverError();
  }

  if (!source || !source.shareToken) return notFound("Share link not found or revoked");

  // Prevent self-claiming
  if (source.userId === recipientUserId) {
    return badRequest("You cannot claim your own shared coupon");
  }

  // Build the claimed copy — strip share-specific and owner-specific fields
  const now = new Date().toISOString();
  const {
    userId: _ownerUserId,
    id: _sourceId,
    shareToken: _token,
    qrImageS3Key: _qrKey,
    imageUrl: _imageUrl,
    qrImageUrl: _qrImageUrl,
    usageCount: _usageCount,
    amountUsed: _amountUsed,
    ...rest
  } = source;

  const claimed: Coupon = {
    ...(rest as Omit<Coupon, "id" | "userId" | "usageCount" | "amountUsed" | "createdAt" | "updatedAt">),
    id: uuidv4(),
    userId: recipientUserId,
    usageCount: 0,
    amountUsed: 0,
    isActive: true,
    status: rest.status ?? "active",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: claimed }));
  } catch (err) {
    console.error("[claim] PutCommand error:", err);
    return serverError();
  }

  // Notify the sharer if they have the setting enabled (fire-and-forget)
  notifySharer(source.userId, source.title ?? "coupon", recipientUserId).catch(() => {});

  return created({ coupon: claimed });
};

async function notifySharer(
  sharerUserId: string,
  couponTitle: string,
  _recipientId: string
): Promise<void> {
  const prefs = await getPrefs(sharerUserId);
  if (!prefs.notifyOnClaim) return;

  const pushToken = await getPushToken(sharerUserId);
  if (!pushToken) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: pushToken,
      title: "Your coupon was claimed!",
      body: `Someone added your shared "${couponTitle}" to their Vaulty.`,
    }),
  });
}
