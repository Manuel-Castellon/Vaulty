import { APIGatewayProxyHandler } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "../../lib/dynamodb";
import { ok, badRequest, serverError } from "../../lib/response";
import type { Coupon } from "@coupon/shared";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function summarise(coupon: Coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    store: coupon.store,
    title: coupon.title,
    category: coupon.category,
    description: coupon.description,
    itemType: coupon.itemType,
    status: coupon.status ?? "active",
    conditions: coupon.conditions,
    discount: coupon.discount,
    faceValue: coupon.faceValue,
    cost: coupon.cost,
    currency: coupon.currency,
    expiresAt: coupon.expiresAt,
    eventDate: coupon.eventDate,
    seatInfo: coupon.seatInfo,
    quantity: coupon.quantity,
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return serverError("AI service not configured");

  const userId = event.requestContext.authorizer?.claims?.sub ?? "anonymous";

  let body: { query: string };
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.query?.trim()) return badRequest("query is required");

  // Fetch all user coupons (up to 200 — sufficient for MVP)
  let coupons: Coupon[];
  try {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        Limit: 200,
      })
    );
    coupons = (result.Items ?? []) as Coupon[];
  } catch (err) {
    console.error("DynamoDB error:", err);
    return serverError();
  }

  if (coupons.length === 0) return ok({ items: [] });

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. The user is searching their personal vault of coupons and vouchers.

User query: "${body.query}"

Here are their saved items as JSON:
${JSON.stringify(coupons.map(summarise))}

Return a JSON array of IDs of matching items, ordered by relevance (most relevant first).
Rank by this priority:
1. Exact match on code field
2. Merchant/store name match
3. Title match
4. Category match
5. Description or conditions match

Only include items that genuinely match the query. Do not include all items.
If nothing matches, return an empty array [].
Return ONLY a JSON array of ID strings, no markdown, no explanation.`;

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const gemini = await resp.json() as {
      error?: { message: string };
      candidates?: { content: { parts: { text: string }[] } }[];
    };

    if (!resp.ok || gemini.error) {
      console.error("Gemini error:", gemini.error);
      return serverError("AI search failed — try again");
    }

    const raw = gemini.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const ids: string[] = JSON.parse(cleaned);

    // Reorder coupons to match Gemini's ranked order
    const couponMap = new Map(coupons.map((c) => [c.id, c]));
    const ranked = ids.flatMap((id) => {
      const c = couponMap.get(id);
      return c ? [c] : [];
    });

    return ok({ items: ranked });
  } catch (err) {
    console.error("Search error:", err);
    return serverError("Failed to parse AI response");
  }
};
