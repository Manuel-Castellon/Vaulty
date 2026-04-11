import { ScheduledHandler } from "aws-lambda";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import type { Coupon } from "@coupon/shared";
import { getPrefs } from "./preferences";

// Fallback threshold from env — used only when user has no stored preferences
const DEFAULT_DAYS_BEFORE_EXPIRY = parseInt(process.env.EXPIRY_DAYS_THRESHOLD ?? "3", 10);

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Expo Push API accepts up to 100 messages per request
  const CHUNK_SIZE = 100;
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error("[expiry-check] Expo Push API error:", res.status, await res.text());
    } else {
      console.log(`[expiry-check] Sent ${chunk.length} push notifications`);
    }
  }
}

async function getPushToken(userId: string): Promise<string | null> {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId, id: "PUSH_TOKEN" },
      })
    );
    return (result.Item?.expoPushToken as string) ?? null;
  } catch {
    return null;
  }
}

export const handler: ScheduledHandler = async () => {
  const now = new Date();
  // Use the widest possible window for the scan (30 days) and filter per-user below
  const maxThresholdDate = new Date(now);
  maxThresholdDate.setDate(maxThresholdDate.getDate() + 30);

  const nowIso = now.toISOString();
  const maxThresholdIso = maxThresholdDate.toISOString();

  console.log(`[expiry-check] Scanning for coupons expiring between ${nowIso} and ${maxThresholdIso}`);

  // Scan for all expiring coupons within the max window, group by userId
  const expiringByUser = new Map<string, Coupon[]>();
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "attribute_exists(expiresAt) AND expiresAt > :now AND expiresAt <= :threshold AND id <> :pushToken AND id <> :prefs",
        ExpressionAttributeValues: {
          ":now": nowIso,
          ":threshold": maxThresholdIso,
          ":pushToken": "PUSH_TOKEN",
          ":prefs": "NOTIFICATION_PREFS",
        },
        ExclusiveStartKey: lastEvaluatedKey as any,
      })
    );

    for (const item of (result.Items ?? []) as Coupon[]) {
      const list = expiringByUser.get(item.userId) ?? [];
      list.push(item);
      expiringByUser.set(item.userId, list);
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  console.log(`[expiry-check] Found ${expiringByUser.size} users with items expiring within 30 days`);

  // Build push messages
  const messages: ExpoPushMessage[] = [];

  for (const [userId, allCoupons] of expiringByUser) {
    // Fetch per-user notification preferences
    const prefs = await getPrefs(userId);
    if (!prefs.enabled) {
      console.log(`[expiry-check] Notifications disabled for userId=${userId}, skipping`);
      continue;
    }

    // Filter to only coupons within this user's configured threshold
    const thresholdDate = new Date(now);
    thresholdDate.setDate(thresholdDate.getDate() + prefs.daysBeforeExpiry);
    const thresholdIso = thresholdDate.toISOString();
    const coupons = allCoupons.filter((c) => c.expiresAt! <= thresholdIso);
    if (coupons.length === 0) continue;

    const pushToken = await getPushToken(userId);
    if (!pushToken) {
      console.log(`[expiry-check] No push token for userId=${userId}, skipping`);
      continue;
    }

    const daysLeft = Math.ceil(
      (new Date(coupons[0].expiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    let title: string;
    let body: string;

    let data: Record<string, unknown> | undefined;

    if (coupons.length === 1) {
      const c = coupons[0];
      title = "Expiring soon!";
      body =
        daysLeft === 0
          ? `"${c.title}" at ${c.store} expires today!`
          : `"${c.title}" at ${c.store} expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
      data = { couponId: c.id };
    } else {
      title = `${coupons.length} items expiring soon`;
      body =
        daysLeft === 0
          ? `You have ${coupons.length} coupons or vouchers expiring today!`
          : `You have ${coupons.length} coupons or vouchers expiring within ${prefs.daysBeforeExpiry} day${prefs.daysBeforeExpiry !== 1 ? "s" : ""}`;
    }

    messages.push({ to: pushToken, title, body, data });
  }

  await sendExpoPushNotifications(messages);
  console.log(`[expiry-check] Done. Sent ${messages.length} notifications.`);
};
