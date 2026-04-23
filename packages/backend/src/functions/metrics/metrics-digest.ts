import { ScheduledHandler } from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import type { Coupon } from "@coupon/shared";

const cognito = new CognitoIdentityProviderClient({
  region: process.env.REGION ?? "us-east-1",
});
const ses = new SESClient({ region: process.env.REGION ?? "us-east-1" });

const USER_POOL_ID = process.env.USER_POOL_ID!;
const DEVELOPER_EMAIL = process.env.DEVELOPER_EMAIL!;
const SES_SENDER = process.env.SES_SENDER!;

interface DigestMetrics {
  totalUsers: number;
  newUsersInPeriod: number;
  totalCoupons: number;
  newCouponsInPeriod: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byItemType: Record<string, number>;
  periodStart: string;
  periodEnd: string;
}

async function getUserMetrics(periodStart: string): Promise<{ total: number; newInPeriod: number }> {
  let total = 0;
  let newInPeriod = 0;
  let paginationToken: string | undefined;

  do {
    const result = await cognito.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
        PaginationToken: paginationToken,
      })
    );
    const users = result.Users ?? [];
    total += users.length;
    newInPeriod += users.filter(
      (u) => u.UserCreateDate && u.UserCreateDate.toISOString() >= periodStart
    ).length;
    paginationToken = result.PaginationToken;
  } while (paginationToken);

  return { total, newInPeriod };
}

async function getCouponMetrics(
  periodStart: string,
  periodEnd: string
): Promise<Omit<DigestMetrics, "totalUsers" | "newUsersInPeriod" | "periodStart" | "periodEnd">> {
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byItemType: Record<string, number> = {};
  let totalCoupons = 0;
  let newCouponsInPeriod = 0;

  let lastKey: Record<string, unknown> | undefined;
  const NON_COUPON = new Set(["NOTIFICATION_PREFS", "PUSH_TOKEN"]);

  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "attribute_exists(title)",
        ExclusiveStartKey: lastKey as any,
      })
    );

    for (const item of (result.Items ?? []) as Coupon[]) {
      if (NON_COUPON.has(item.id)) continue;
      totalCoupons++;

      if (item.createdAt >= periodStart && item.createdAt <= periodEnd) newCouponsInPeriod++;

      const cat = item.category ?? "other";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;

      const status = item.status ?? "active";
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      const type = item.itemType ?? "coupon";
      byItemType[type] = (byItemType[type] ?? 0) + 1;
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return { totalCoupons, newCouponsInPeriod, byCategory, byStatus, byItemType };
}

function buildHtml(m: DigestMetrics): string {
  const tableRow = (label: string, value: string | number) =>
    `<tr><td style="padding:6px 12px;color:#666;font-size:13px;">${label}</td><td style="padding:6px 12px;font-weight:600;font-size:13px;">${value}</td></tr>`;

  const categoryRows = Object.entries(m.byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => tableRow(cat, count))
    .join("");

  const statusRows = Object.entries(m.byStatus)
    .sort(([, a], [, b]) => b - a)
    .map(([s, count]) => tableRow(s, count))
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8fa;margin:0;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#007aff,#0051a8);padding:24px 28px;">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;">Vaulty Metrics Digest</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${m.periodStart} – ${m.periodEnd}</p>
  </div>

  <div style="padding:24px 28px;">
    <h2 style="margin:0 0 12px;font-size:15px;color:#111;">Users</h2>
    <table style="width:100%;border-collapse:collapse;background:#f9f9fb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${tableRow("Total registered", m.totalUsers)}
      ${tableRow("New in period", m.newUsersInPeriod)}
    </table>

    <h2 style="margin:0 0 12px;font-size:15px;color:#111;">Coupons &amp; Vouchers</h2>
    <table style="width:100%;border-collapse:collapse;background:#f9f9fb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${tableRow("Total in library", m.totalCoupons)}
      ${tableRow("Added in period", m.newCouponsInPeriod)}
      ${tableRow("Coupons", m.byItemType["coupon"] ?? 0)}
      ${tableRow("Vouchers", m.byItemType["voucher"] ?? 0)}
    </table>

    <h2 style="margin:0 0 12px;font-size:15px;color:#111;">By Status</h2>
    <table style="width:100%;border-collapse:collapse;background:#f9f9fb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      ${statusRows}
    </table>

    <h2 style="margin:0 0 12px;font-size:15px;color:#111;">By Category</h2>
    <table style="width:100%;border-collapse:collapse;background:#f9f9fb;border-radius:8px;overflow:hidden;">
      ${categoryRows}
    </table>
  </div>
</div>
</body>
</html>`;
}

export const handler: ScheduledHandler = async () => {
  const now = new Date();
  const periodEnd = now.toISOString().split("T")[0];
  const periodStartDate = new Date(now);
  periodStartDate.setDate(periodStartDate.getDate() - 4); // ~Mon+Thu cadence covers 3-4 days
  const periodStart = periodStartDate.toISOString().split("T")[0];

  console.log(`[metrics-digest] Generating digest for ${periodStart} to ${periodEnd}`);

  const [userMetrics, couponMetrics] = await Promise.all([
    getUserMetrics(`${periodStart}T00:00:00.000Z`),
    getCouponMetrics(`${periodStart}T00:00:00.000Z`, `${periodEnd}T23:59:59.999Z`),
  ]);

  const metrics: DigestMetrics = {
    totalUsers: userMetrics.total,
    newUsersInPeriod: userMetrics.newInPeriod,
    ...couponMetrics,
    periodStart,
    periodEnd,
  };

  const html = buildHtml(metrics);

  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_SENDER,
        Destination: { ToAddresses: [DEVELOPER_EMAIL] },
        Message: {
          Subject: { Data: `Vaulty digest — ${periodStart} to ${periodEnd}` },
          Body: {
            Html: { Data: html },
            Text: {
              Data: [
                `Vaulty Metrics Digest (${periodStart} – ${periodEnd})`,
                `Users: ${userMetrics.total} total, ${userMetrics.newInPeriod} new`,
                `Coupons: ${couponMetrics.totalCoupons} total, ${couponMetrics.newCouponsInPeriod} new`,
              ].join("\n"),
            },
          },
        },
      })
    );
    console.log("[metrics-digest] Email sent successfully");
  } catch (err) {
    console.error("[metrics-digest] SES send error:", err);
  }
};
