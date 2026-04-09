import { ScheduledHandler } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import type { Coupon } from "@coupon/shared";

// Configurable: how many days before expiry to notify
const DAYS_BEFORE_EXPIRY = parseInt(process.env.EXPIRY_DAYS_THRESHOLD ?? "3", 10);

export const handler: ScheduledHandler = async () => {
  const now = new Date();
  const thresholdDate = new Date(now);
  thresholdDate.setDate(thresholdDate.getDate() + DAYS_BEFORE_EXPIRY);

  // ISO strings for DynamoDB filter comparison
  const nowIso = now.toISOString();
  const thresholdIso = thresholdDate.toISOString();

  console.log(
    `[expiry-check] Scanning for coupons expiring between ${nowIso} and ${thresholdIso} (${DAYS_BEFORE_EXPIRY}-day window)`
  );

  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let totalScanned = 0;
  let totalExpiring = 0;

  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "attribute_exists(expiresAt) AND expiresAt > :now AND expiresAt <= :threshold",
        ExpressionAttributeValues: {
          ":now": nowIso,
          ":threshold": thresholdIso,
        },
        ExclusiveStartKey: lastEvaluatedKey as any,
      })
    );

    const items = (result.Items ?? []) as Coupon[];
    totalScanned += result.ScannedCount ?? 0;
    totalExpiring += items.length;

    for (const coupon of items) {
      const expiresAt = coupon.expiresAt ? new Date(coupon.expiresAt) : null;
      const daysLeft = expiresAt
        ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      console.log(
        `[expiry-check] EXPIRING SOON — userId=${coupon.userId} couponId=${coupon.id} ` +
          `title="${coupon.title}" store="${coupon.store}" ` +
          `expiresAt=${coupon.expiresAt} daysLeft=${daysLeft}`
      );

      // TODO (post-MVP): deliver push notification to coupon.userId
      // e.g. look up device push token from a Users table, then call
      // SNS / Expo Push Notifications API
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  console.log(
    `[expiry-check] Done. Scanned ${totalScanned} items, found ${totalExpiring} expiring within ${DAYS_BEFORE_EXPIRY} days.`
  );
};
