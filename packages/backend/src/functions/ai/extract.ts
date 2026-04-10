/**
 * POST /extract
 *
 * Primary path: Gemini multimodal — reads image/PDF directly, handles Hebrew natively.
 * Secondary path: Bedrock Claude Vision — enabled via BEDROCK_ENABLED=true env var
 *   (currently quota-limited; Textract is NOT used — confirmed broken for Hebrew).
 *
 * QR detection runs in parallel via jsQR for image uploads.
 */
import { APIGatewayProxyHandler } from "aws-lambda";
import { ok, badRequest, serverError } from "../../lib/response";
import type { ExtractResponse, ExtractionResult, ExtractRequest, SourceScript } from "@coupon/shared";
import { runExtractionPipeline } from "../../services/extractionPipeline";
import { extractQRFromImage } from "../../services/qrExtractionService";

// ── Gemini path ──────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const BASE_PROMPT = `RULE #1 - LANGUAGE PRESERVATION (NON-NEGOTIABLE)
If the document is in Hebrew, Arabic, or any non-English language, every text field in your output MUST stay in the ORIGINAL language and ORIGINAL script.
DO NOT translate. DO NOT transliterate.

Correct Hebrew example:
{ "title": "פיצה משפחתית", "store": "דומינוס" }

Incorrect translated example (REJECTED):
{ "title": "Family Pizza", "store": "Dominos" }

You are extracting structured data from a coupon or voucher document.

First determine:
- sourceLanguage: ISO 639-1 code when known (for example "he", "en", "ar")
- sourceScript: one of "latin" | "hebrew" | "arabic" | "cjk" | "cyrillic" | "other"

Classify itemType carefully:
- "coupon": a discount offer that reduces the purchase price at checkout
  Examples: "20% off", "50 ש״ח הנחה", promo code for an order
- "voucher": a prepaid entitlement, specific item/meal, gift/credit card, event ticket, or store credit
  Examples: שובר מתנה, ארוחה זוגית, כרטיס להופעה, gift card, prepaid balance

Extract only the fields you can confidently determine:
- title: string (VERBATIM - the main offer heading, source language and script)
- store: string (VERBATIM - merchant or brand name ONLY, not the product description, source language and script)
- itemType: "coupon" | "voucher"
- description: string (VERBATIM - what the holder is entitled to, source language and script)
- conditions: string (VERBATIM - usage restrictions, source language and script)
- seatInfo: string (VERBATIM - seat/row/section for event tickets, source language and script)
- discount: { type: "percentage", value: number } | { type: "fixed", value: number, currency: string }
  ONLY for true discount coupons. Do NOT use for prepaid or gift vouchers.
- faceValue: number — the nominal spend value of a prepaid voucher (e.g. can spend 100 ₪ → faceValue: 100)
- cost: number — what was paid to acquire this voucher (e.g. paid 60 ₪ for a 100 ₪ voucher → cost: 60)
- currency: ISO 4217 code ONLY — write "ILS" not "₪", "USD" not "$", "EUR" not "€"
- code: string for barcode number, serial number, or redemption code
- expiresAt: ISO 8601 date string YYYY-MM-DD
- issueDate: ISO 8601 date string YYYY-MM-DD — when the voucher was issued or purchased
- eventDate: ISO 8601 date string YYYY-MM-DD — for event tickets only
- quantity: number for how many items or tickets this voucher covers
- usageLimit: "one-time" | "multi-use" | or a specific description like "up to 5 times"
- category: one of food | retail | travel | entertainment | health | tech | other

CRITICAL DISTINCTIONS:
- discount vs faceValue/cost: a 100 ₪ voucher bought for 60 ₪ → use faceValue: 100, cost: 60, NOT discount
- currency: always ISO 4217 code — "ILS" never "₪", "USD" never "$"
- store: brand or merchant name only — not "שובר ב-100 ₪ למימוש 200 ₪ בקסטרו", just "קסטרו"

Return ONLY valid JSON. No markdown. No code fences. No explanation.`;

const TEXT_FIELDS: Array<keyof ExtractionResult> = [
  "title",
  "store",
  "description",
  "conditions",
  "seatInfo",
];

const SCRIPT_PATTERNS: Record<Exclude<SourceScript, "latin" | "other">, RegExp> = {
  hebrew: /[\u0590-\u05FF]/,
  arabic: /[\u0600-\u06FF]/,
  cjk: /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/,
  cyrillic: /[\u0400-\u04FF]/,
};

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

class GeminiQuotaError extends Error {
  constructor() {
    super("gemini_quota_exhausted");
  }
}

function buildPrompt(extraInstruction?: string) {
  return extraInstruction ? `${BASE_PROMPT}\n\n${extraInstruction}` : BASE_PROMPT;
}

function parseGeminiJson(raw: string): ExtractionResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

function validateLanguagePreservation(extracted: ExtractionResult): boolean {
  const script = extracted.sourceScript;
  if (!script || script === "latin" || script === "other") return true;
  const expectedPattern = SCRIPT_PATTERNS[script];
  if (!expectedPattern) return true;
  return TEXT_FIELDS.every((field) => {
    const value = extracted[field];
    if (typeof value !== "string" || value.trim().length === 0) return true;
    return expectedPattern.test(value) || !/[A-Za-z]/.test(value);
  });
}

async function callGemini(
  apiKey: string,
  body: ExtractRequest,
  extraInstruction?: string
): Promise<ExtractionResult> {
  const prompt = buildPrompt(extraInstruction);
  const parts =
    body.data && body.mimeType
      ? [
          { inline_data: { mime_type: body.mimeType, data: body.data } },
          { text: prompt },
        ]
      : body.text
        ? [{ text: `${prompt}\n\nDocument text:\n${body.text}` }]
        : null;

  if (!parts) throw new Error("missing_input");

  const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  const gemini = (await resp.json()) as {
    error?: { message: string; status?: string };
    candidates?: { content: { parts: { text: string }[] } }[];
  };

  if (!resp.ok || gemini.error) {
    console.error("Gemini error:", gemini.error);
    if (resp.status === 429 || gemini.error?.status === "RESOURCE_EXHAUSTED") {
      throw new GeminiQuotaError();
    }
    throw new Error("gemini_error");
  }

  const raw = gemini.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseGeminiJson(raw);
}

async function handleGemini(
  apiKey: string,
  body: ExtractRequest
): Promise<ExtractResponse> {
  const isImage = !!body.mimeType && IMAGE_MIME_TYPES.has(body.mimeType);
  const imageBytes = isImage && body.data ? Buffer.from(body.data, "base64") : undefined;
  const qrKeyPrefix = `extractions/qr/${Date.now()}`;

  // Run text extraction and QR detection in parallel for image uploads
  const [extractionResult, qrResult] = await Promise.allSettled([
    callGemini(apiKey, body),
    imageBytes
      ? extractQRFromImage(imageBytes, qrKeyPrefix)
      : Promise.resolve({ qrImageS3Key: null, qrData: null }),
  ]);

  if (extractionResult.status === "rejected") throw extractionResult.reason;

  let extracted = extractionResult.value;
  const qr = qrResult.status === "fulfilled" ? qrResult.value : { qrImageS3Key: null, qrData: null };

  // If jsQR decoded the QR and Gemini didn't find a code, use jsQR's value
  if (qr.qrData && !extracted.code) {
    extracted = { ...extracted, code: qr.qrData };
  }

  if (validateLanguagePreservation(extracted)) {
    return {
      extraction: extracted,
      qrImageS3Key: qr.qrImageS3Key ?? undefined,
    };
  }

  const retryInstruction = `CRITICAL: Your previous response translated text to English. Retry using VERBATIM ${extracted.sourceScript ?? "source"} script text only.
Previous invalid output:
${JSON.stringify(extracted)}`;

  const retried = await callGemini(apiKey, body, retryInstruction);
  const warnings: string[] = [];
  if (!validateLanguagePreservation(retried)) {
    console.warn("Language preservation validation failed after retry");
    warnings.push("language_validation_failed");
  }

  return {
    extraction: retried,
    qrImageS3Key: qr.qrImageS3Key ?? undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const handler: APIGatewayProxyHandler = async (event) => {
  let body: ExtractRequest;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return badRequest("Invalid JSON body");
  }

  const hasFile = (body.data && body.mimeType) || body.s3Key;
  if (!hasFile && !body.text) {
    return badRequest("Provide either data+mimeType, s3Key, or text");
  }

  // ── Bedrock path (Claude Vision, no Textract) ─────────────────────────────
  if (process.env.BEDROCK_ENABLED === "true") {
    try {
      const result = await runExtractionPipeline({
        data: body.data,
        mimeType: body.mimeType,
        s3Key: body.s3Key,
        text: body.text,
      });
      return ok<ExtractResponse>(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Bedrock pipeline error:", msg);
      if (msg === "missing_input") return badRequest("Provide either data+mimeType, s3Key, or text");
      return serverError("Extraction failed — try again");
    }
  }

  // ── Gemini path (default) ─────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return serverError("AI service not configured");

  try {
    const result = await handleGemini(apiKey, body);
    return ok<ExtractResponse>(result);
  } catch (err) {
    console.error("Extraction error:", err);
    if (err instanceof GeminiQuotaError) {
      return serverError(
        "AI scanning is temporarily unavailable. You can still enter the voucher details manually and try scanning again later."
      );
    }
    if (err instanceof Error && err.message === "gemini_error") {
      return serverError("AI extraction failed — try again");
    }
    return serverError("Failed to parse AI response");
  }
};
