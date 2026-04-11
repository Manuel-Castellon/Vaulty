import { APIGatewayProxyHandler } from "aws-lambda";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, badRequest, serverError } from "../../lib/response";
import type { NotificationPreferences } from "@coupon/shared";

const PREFS_ID = "NOTIFICATION_PREFS";

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  daysBeforeExpiry: 3,
};

export async function getPrefs(userId: string): Promise<NotificationPreferences> {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId, id: PREFS_ID },
      })
    );
    if (!result.Item) return { ...DEFAULT_PREFS };
    return {
      enabled: result.Item.enabled ?? DEFAULT_PREFS.enabled,
      daysBeforeExpiry: result.Item.daysBeforeExpiry ?? DEFAULT_PREFS.daysBeforeExpiry,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) return badRequest("Unauthorized");

  if (event.httpMethod === "GET") {
    const prefs = await getPrefs(userId);
    return ok(prefs);
  }

  if (event.httpMethod === "PUT") {
    let body: Partial<NotificationPreferences>;
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return badRequest("Invalid JSON");
    }

    const current = await getPrefs(userId);

    const enabled =
      typeof body.enabled === "boolean" ? body.enabled : current.enabled;
    const daysBeforeExpiry =
      typeof body.daysBeforeExpiry === "number"
        ? Math.max(1, Math.min(30, Math.round(body.daysBeforeExpiry)))
        : current.daysBeforeExpiry;

    const updated: NotificationPreferences = { enabled, daysBeforeExpiry };

    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            userId,
            id: PREFS_ID,
            ...updated,
            updatedAt: new Date().toISOString(),
          },
        })
      );
      return ok(updated);
    } catch (err) {
      console.error("[notification-prefs] error:", err);
      return serverError();
    }
  }

  return badRequest("Method not allowed");
};
