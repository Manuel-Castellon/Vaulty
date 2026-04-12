import { APIGatewayProxyHandler } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, serverError, unauthorized } from "../../lib/response";
import type { CouponStatus } from "@coupon/shared";

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) return unauthorized();
  const limit = event.queryStringParameters?.limit
    ? parseInt(event.queryStringParameters.limit)
    : 50;
  const statusFilter = event.queryStringParameters?.status as CouponStatus | undefined;

  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        Limit: limit,
        ExclusiveStartKey: event.queryStringParameters?.nextToken
          ? JSON.parse(
              Buffer.from(
                event.queryStringParameters.nextToken,
                "base64"
              ).toString()
            )
          : undefined,
      })
    );

    // Exclude system records stored in the same table (prefs, push tokens, etc.)
    // Normalize legacy items and apply optional status filter
    let items = (result.Items ?? [])
      .filter((item) => item.id !== "NOTIFICATION_PREFS" && item.id !== "PUSH_TOKEN")
      .map((item) => {
        if (item.status === undefined) item.status = "active";
        return item;
      });

    if (statusFilter) {
      items = items.filter((item) => item.status === statusFilter);
    }

    return ok({
      items,
      nextToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
            "base64"
          )
        : undefined,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
