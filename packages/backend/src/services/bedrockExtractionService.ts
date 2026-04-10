import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { ExtractionResult } from "@coupon/shared";

/** Bedrock response extended with fields not in ExtractionResult */
export interface AIExtractionResult extends ExtractionResult {
  issueDate?: string;
  usageLimit?: string;
  confidencePerField?: Record<string, number>;
  warnings?: string[];
}

// Default to Claude 3 Haiku — cheapest Claude model on Bedrock.
// Override with BEDROCK_MODEL_ID env var (e.g. anthropic.claude-3-5-haiku-20241022-v1:0).
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-haiku-20240307-v1:0";

const bedrock = new BedrockRuntimeClient({
  region: process.env.REGION ?? "us-east-1",
});

const SYSTEM_PROMPT = `You are an expert at extracting structured data from coupon and voucher documents.

CRITICAL LANGUAGE RULE (NON-NEGOTIABLE):
If the document is in Hebrew, Arabic, or any non-English language, ALL text fields in your output MUST remain in the ORIGINAL language and script. Never translate. Never transliterate.

Correct Hebrew example:  { "title": "פיצה משפחתית", "store": "דומינוס" }
Wrong (rejected):        { "title": "Family Pizza", "store": "Dominos" }`;

const USER_PROMPT_TEMPLATE = `Parse the following voucher/coupon document and return a single JSON object. Include only fields you can confidently determine — omit fields you cannot.

FIELD DEFINITIONS:
- title: the main offer heading (VERBATIM, original language & script)
- store: merchant or brand name ONLY — not the product description (VERBATIM, original language & script)
- itemType: "coupon" (discount at checkout) | "voucher" (prepaid entitlement, gift card, ticket, store credit)
- sourceLanguage: ISO 639-1 code ("en", "he", "ar", etc.)
- sourceScript: "latin" | "hebrew" | "arabic" | "cjk" | "cyrillic" | "other"
- description: what the holder is entitled to (VERBATIM, original language)
- conditions: usage restrictions (VERBATIM, original language)
- seatInfo: seat/row/section for event tickets (VERBATIM, original language)
- discount: { "type": "percentage", "value": number } OR { "type": "fixed", "value": number, "currency": string } — for discount coupons ONLY
- faceValue: number — nominal spend value of a prepaid voucher (e.g. can spend 100 ₪ → faceValue: 100)
- cost: number — what was paid to acquire this voucher (e.g. paid 60 ₪ for 100 ₪ voucher → cost: 60)
- currency: ISO 4217 code ONLY — "ILS" not "₪", "USD" not "$", "EUR" not "€"
- code: barcode number, serial number, or redemption code
- expiresAt: ISO 8601 date YYYY-MM-DD
- issueDate: ISO 8601 date YYYY-MM-DD — when the voucher was issued or purchased
- eventDate: ISO 8601 date YYYY-MM-DD — for event tickets only
- quantity: number of items or tickets this voucher covers
- usageLimit: "one-time" | "multi-use" | or specific description like "up to 5 times"
- category: "food" | "retail" | "travel" | "entertainment" | "health" | "tech" | "other"
- confidencePerField: object mapping each returned field name to a confidence score 0.0–1.0
- warnings: array of strings describing ambiguities, missing data, or parsing issues

CRITICAL DISTINCTIONS:
- discount vs faceValue/cost: a 100 ₪ voucher bought for 60 ₪ → faceValue: 100, cost: 60, NOT discount
- currency: always ISO 4217 — "ILS" never "₪", "USD" never "$"
- store: brand name only — not "שובר ב-100 ₪ למימוש 200 ₪ בקסטרו", just "קסטרו"
- Output ONLY valid JSON — no markdown fences, no explanation

EXTRACTED TEXT:
{TEXT}`;

interface BedrockClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

function buildTextPrompt(rawText: string): string {
  return USER_PROMPT_TEMPLATE.replace("{TEXT}", rawText || "(no text extracted)");
}

function parseResponse(raw: string): AIExtractionResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

async function invokeModel(messages: unknown[]): Promise<AIExtractionResult> {
  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages,
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(JSON.stringify(payload)),
  });

  const response = await bedrock.send(command);
  const bodyText = Buffer.from(response.body).toString("utf-8");
  const parsed = JSON.parse(bodyText) as BedrockClaudeResponse;
  const text = parsed.content?.[0]?.text ?? "";
  console.log("Bedrock raw response:", text.slice(0, 500));
  return parseResponse(text);
}

/** Extract from raw text (email paste or pre-OCR'd content). */
export async function extractVoucherFields(
  rawText: string,
  _kvPairs: Record<string, string> = {}
): Promise<AIExtractionResult> {
  return invokeModel([{ role: "user", content: buildTextPrompt(rawText) }]);
}

/**
 * Extract from an image using Claude Vision (no separate OCR step).
 * Handles Hebrew and other non-Latin scripts natively.
 */
export async function extractVoucherFieldsFromImage(
  imageBytes: Buffer,
  mimeType: string
): Promise<AIExtractionResult> {
  const VISION_PROMPT = `Extract structured data from this voucher/coupon image and return a single JSON object.
Include only fields you can confidently determine — omit fields you cannot.

${USER_PROMPT_TEMPLATE.replace("{TEXT}", "(read directly from the image above)")}`;

  return invokeModel([{
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: imageBytes.toString("base64"),
        },
      },
      { type: "text", text: VISION_PROMPT },
    ],
  }]);
}
