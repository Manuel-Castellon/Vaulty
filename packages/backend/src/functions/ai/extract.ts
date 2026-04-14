/**
 * POST /extract
 *
 * Uses the LLM provider abstraction layer for AI extraction.
 * Default provider: Gemini 2.5 Flash Lite (free tier).
 * Alternative: Bedrock Claude Vision (BEDROCK_ENABLED=true).
 *
 * QR detection runs in parallel via jsQR for image uploads.
 */
import { APIGatewayProxyHandler } from "aws-lambda";
import { createHash } from "crypto";
import { ok, badRequest, serverError, unauthorized } from "../../lib/response";
import { log } from "../../lib/logger";
import type { ExtractResponse, ExtractionResult, ExtractRequest, SourceScript } from "@coupon/shared";
import { createProvider, ProviderQuotaError } from "../../services/llmProvider";
import type { LLMExtractionProvider } from "../../services/llmProvider";
import { extractQRFromImage } from "../../services/qrExtractionService";

// ── Shared extraction prompt ─────────────────────────────────────────────────

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
const QUOTA_COOLDOWN_FALLBACK_SECONDS = 30;
const quotaCooldownByKey = new Map<string, number>();

function hashInputBody(body: ExtractRequest): string {
  const hash = createHash("sha1");
  if (body.data) hash.update(body.data);
  if (body.mimeType) hash.update(body.mimeType);
  if (body.s3Key) hash.update(body.s3Key);
  if (body.text) hash.update(body.text);
  return hash.digest("hex");
}

function buildQuotaKey(event: Parameters<APIGatewayProxyHandler>[0], body: ExtractRequest): string {
  const userId = event.requestContext?.authorizer?.claims?.sub ?? "anonymous";
  return `${userId}:${hashInputBody(body)}`;
}

function getRemainingCooldownSeconds(quotaKey: string, nowMs: number): number | undefined {
  const until = quotaCooldownByKey.get(quotaKey);
  if (!until) return undefined;
  if (nowMs >= until) {
    quotaCooldownByKey.delete(quotaKey);
    return undefined;
  }
  return Math.max(1, Math.ceil((until - nowMs) / 1000));
}

function storeQuotaCooldown(quotaKey: string, retryAfterSeconds?: number): number {
  const cooldownSeconds = retryAfterSeconds ?? QUOTA_COOLDOWN_FALLBACK_SECONDS;
  quotaCooldownByKey.set(quotaKey, Date.now() + cooldownSeconds * 1000);
  return cooldownSeconds;
}

export function __resetQuotaCooldownForTests() {
  quotaCooldownByKey.clear();
}

function buildPrompt(extraInstruction?: string) {
  return extraInstruction ? `${BASE_PROMPT}\n\n${extraInstruction}` : BASE_PROMPT;
}

function validateLanguagePreservation(extracted: ExtractionResult): boolean {
  const script = extracted.sourceScript;
  if (!script || script === "latin" || script === "other") return true;
  const expectedPattern = SCRIPT_PATTERNS[script as Exclude<SourceScript, "latin" | "other">];
  if (!expectedPattern) return true;
  return TEXT_FIELDS.every((field: keyof ExtractionResult) => {
    const value = extracted[field];
    if (typeof value !== "string" || value.trim().length === 0) return true;
    // Brand/store names are often Latin even in Hebrew/Arabic vouchers (e.g. WOLT).
    if (field === "store" && /^[A-Za-z0-9 .&'’\-_/]+$/.test(value.trim())) return true;
    return expectedPattern.test(value) || !/[A-Za-z]/.test(value);
  });
}

/** Call the provider to extract (file or text), with language validation + retry. */
async function callProviderWithRetry(
  provider: LLMExtractionProvider,
  body: ExtractRequest
): Promise<ExtractionResult> {
  const prompt = buildPrompt();
  const extracted =
    body.data && body.mimeType
      ? await provider.extractFromFile(body.data, body.mimeType, prompt)
      : body.text
        ? await provider.extractFromText(body.text, prompt)
        : (() => { throw new Error("missing_input"); })();

  if (validateLanguagePreservation(extracted)) {
    return extracted;
  }

  const retryInstruction = `CRITICAL: Your previous response translated text to English. Retry using VERBATIM ${extracted.sourceScript ?? "source"} script text only.
Previous invalid output:
${JSON.stringify(extracted)}`;

  const retryPrompt = buildPrompt(retryInstruction);
  const retried =
    body.data && body.mimeType
      ? await provider.extractFromFile(body.data, body.mimeType, retryPrompt)
      : await provider.extractFromText(body.text!, retryPrompt);

  if (!validateLanguagePreservation(retried)) {
    log("warn", "extract.language_validation_failed", { provider: provider.name });
  }

  return retried;
}

async function handleExtraction(
  provider: LLMExtractionProvider,
  body: ExtractRequest,
  quotaKey: string
): Promise<ExtractResponse> {
  const isImage = !!body.mimeType && IMAGE_MIME_TYPES.has(body.mimeType);
  const imageBytes = isImage && body.data ? Buffer.from(body.data, "base64") : undefined;
  const qrKeyPrefix = `extractions/qr/${Date.now()}`;

  // Run text extraction and QR detection in parallel for image uploads
  const [extractionResult, qrResult] = await Promise.allSettled([
    callProviderWithRetry(provider, body),
    imageBytes
      ? extractQRFromImage(imageBytes, qrKeyPrefix)
      : Promise.resolve({ qrImageS3Key: null, qrData: null }),
  ]);

  if (extractionResult.status === "rejected") {
    if (extractionResult.reason instanceof ProviderQuotaError && qrResult.status === "fulfilled") {
      const qr = qrResult.value;
      if (qr.qrData || qr.qrImageS3Key) {
        storeQuotaCooldown(quotaKey, extractionResult.reason.retryAfterSeconds);
        return {
          extraction: { ...(qr.qrData ? { code: qr.qrData } : {}) } as ExtractionResult,
          qrImageS3Key: qr.qrImageS3Key ?? undefined,
          warnings: ["quota_exhausted"],
        };
      }
    }
    throw extractionResult.reason;
  }

  let extracted = extractionResult.value;
  const qr = qrResult.status === "fulfilled" ? qrResult.value : { qrImageS3Key: null, qrData: null };

  // If jsQR decoded the QR and the AI didn't find a code, use jsQR's value
  if (qr.qrData && !extracted.code) {
    extracted = { ...extracted, code: qr.qrData };
  }

  const warnings: string[] = [];
  if (!validateLanguagePreservation(extracted)) {
    warnings.push("language_validation_failed");
  }

  return {
    extraction: extracted,
    qrImageS3Key: qr.qrImageS3Key ?? undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!event.requestContext?.authorizer?.claims?.sub) return unauthorized();
  const startMs = Date.now();

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

  const inputType = body.text ? "text" : body.mimeType === "application/pdf" ? "pdf" : "image";
  const quotaKey = buildQuotaKey(event, body);
  const remainingCooldownSeconds = getRemainingCooldownSeconds(quotaKey, Date.now());
  if (remainingCooldownSeconds) {
    log("warn", "extract.quota_cooldown_short_circuit", {
      outcome: "quota",
      inputType,
      remainingCooldownSeconds,
    });
    return serverError(
      `AI scanning is temporarily unavailable. Please try again in about ${remainingCooldownSeconds} seconds. You can still enter the voucher details manually and try scanning again later.`
    );
  }

  const provider = createProvider();
  if (!provider) return serverError("AI service not configured");

  log("info", "extract.started", { provider: provider.name, inputType });
  try {
    const result = await handleExtraction(provider, body, quotaKey);
    log("info", "extract.completed", {
      provider: provider.name,
      inputType,
      outcome: "success",
      durationMs: Date.now() - startMs,
      hasQr: Boolean(result.qrImageS3Key),
    });
    return ok<ExtractResponse>(result);
  } catch (err) {
    const durationMs = Date.now() - startMs;
    if (err instanceof ProviderQuotaError) {
      const cooldownSeconds = storeQuotaCooldown(quotaKey, err.retryAfterSeconds);
      log("warn", "extract.failed", { provider: provider.name, inputType, outcome: "quota", durationMs, cooldownSeconds });
      return serverError(
        `AI scanning is temporarily unavailable. Please try again in about ${cooldownSeconds} seconds. You can still enter the voucher details manually and try scanning again later.`
      );
    }
    if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
      log("error", "extract.failed", { provider: provider.name, inputType, outcome: "network", durationMs, message: err.message });
      return serverError(
        "AI scanning is temporarily unavailable. You can still enter the voucher details manually and try scanning again later."
      );
    }
    if (err instanceof Error && err.message === "gemini_error") {
      log("error", "extract.failed", { provider: provider.name, inputType, outcome: "provider_error", durationMs, message: err.message });
      return serverError("AI extraction failed — try again");
    }
    if (err instanceof SyntaxError) {
      log("error", "extract.failed", { provider: provider.name, inputType, outcome: "parse_error", durationMs, message: err.message });
    } else {
      log("error", "extract.failed", { provider: provider.name, inputType, outcome: "unknown", durationMs, error: String(err) });
    }
    return serverError("Failed to parse AI response");
  }
};
