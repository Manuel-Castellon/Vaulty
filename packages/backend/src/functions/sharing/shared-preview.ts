import { APIGatewayProxyHandler } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { publicOk, publicNotFound } from "../../lib/response";
import type { SharedCouponView } from "@coupon/shared";

const SHARE_TOKEN_INDEX = "shareToken-index";

export const handler: APIGatewayProxyHandler = async (event) => {
  const shareToken = event.pathParameters?.shareToken;
  if (!shareToken) return publicNotFound("Invalid share link");

  let item: Record<string, any> | undefined;
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
    item = result.Items?.[0];
  } catch (err) {
    console.error("[shared-preview] GSI query error:", err);
    return publicNotFound("Share link not found");
  }

  if (!item || !item.shareToken) return publicNotFound("Share link not found or revoked");

  // Strip private fields before returning
  const {
    userId: _userId,
    qrImageS3Key: _qrKey,
    isActive: _isActive,
    usageCount: _usageCount,
    amountUsed: _amountUsed,
    extractionWarnings: _warnings,
    shareToken: _token,
    ...publicView
  } = item;

  return publicOk(publicView as SharedCouponView);
};
