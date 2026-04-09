import { APIGatewayProxyHandler } from "aws-lambda";
import { ok, badRequest, serverError } from "../../lib/response";
import type { ExtractionResult, ExtractRequest } from "@coupon/shared";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = `You are extracting structured data from a coupon or voucher document (may be in Hebrew or other languages).

Classify the itemType carefully:
- "coupon": a discount code applied at checkout — reduces the price of a purchase (e.g. "20% off", "50 NIS off your order")
- "voucher": a prepaid entitlement — a specific item/meal, a gift/credit card, or an event ticket

Extract these fields (only include what you can confidently determine):
- title: string (translate to English if needed, keep concise)
- store: string (merchant/vendor name)
- itemType: "coupon" | "voucher"
- discount: { type: "percentage", value: number } | { type: "fixed", value: number, currency: string }
  Only for true discount coupons. Do NOT use for credit/gift vouchers.
- faceValue: number — for credit/gift vouchers: the total value you can spend
- cost: number — for credit/gift vouchers: the price paid to acquire it
  Example: "pay 100 NIS, get 200 NIS credit" → faceValue=200, cost=100
- currency: string (e.g. "ILS", "USD")
- code: string (the barcode number or redemption code)
- expiresAt: ISO 8601 date string (e.g. "2026-12-31")
- eventDate: ISO 8601 date string — only for event tickets (the actual event date)
- seatInfo: string — only for tickets with assigned seats (e.g. "Row 7, Seats 1-2")
- conditions: string — usage restrictions (e.g. "Valid at Rami Levi branches only")
- quantity: number — how many items/tickets this voucher covers
- category: one of: food | retail | travel | entertainment | health | tech | other
- description: string — brief description if useful

Return ONLY valid JSON. No markdown, no code fences, no explanation.`;

function parseGeminiJson(raw: string): ExtractionResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return serverError("AI service not configured");

  let body: ExtractRequest;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return badRequest("Invalid JSON body");
  }

  let parts: object[];
  if (body.data && body.mimeType) {
    parts = [
      { inline_data: { mime_type: body.mimeType, data: body.data } },
      { text: PROMPT },
    ];
  } else if (body.text) {
    parts = [
      { text: `${PROMPT}\n\nDocument text:\n${body.text}` },
    ];
  } else {
    return badRequest("Provide either data+mimeType (file) or text");
  }

  try {
    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    const gemini = await resp.json() as {
      error?: { message: string };
      candidates?: { content: { parts: { text: string }[] } }[];
    };

    if (!resp.ok || gemini.error) {
      console.error("Gemini error:", gemini.error);
      return serverError("AI extraction failed — try again");
    }

    const raw = gemini.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const extracted: ExtractionResult = parseGeminiJson(raw);
    return ok(extracted);
  } catch (err) {
    console.error("Extraction error:", err);
    return serverError("Failed to parse AI response");
  }
};
