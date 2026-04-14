/**
 * LLM Provider Abstraction Layer
 *
 * Defines a provider-agnostic interface for AI text/document extraction,
 * with concrete implementations for Gemini and Bedrock Claude.
 *
 * Adding a new provider:
 *   1. Implement LLMExtractionProvider
 *   2. Add a branch in createProvider()
 *   3. Deploy — no handler changes needed
 */

import type { ExtractionResult } from "@coupon/shared";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── Provider interface ───────────────────────────────────────────────────────

export interface LLMExtractionProvider {
  /** Human-readable provider name for logging */
  readonly name: string;

  /** Extract structured data from a file (image or PDF as base64) */
  extractFromFile(
    base64Data: string,
    mimeType: string,
    prompt: string
  ): Promise<ExtractionResult>;

  /** Extract structured data from raw text (email paste, etc.) */
  extractFromText(text: string, prompt: string): Promise<ExtractionResult>;
}

// ── Provider errors ──────────────────────────────────────────────────────────

/**
 * Thrown when a provider hits a rate limit or quota ceiling.
 * The handler uses retryAfterSeconds to set a cooldown timer.
 */
export class ProviderQuotaError extends Error {
  readonly retryAfterSeconds?: number;
  readonly provider: string;

  constructor(provider: string, retryAfterSeconds?: number) {
    super(`${provider}_quota_exhausted`);
    this.provider = provider;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ── Gemini provider ──────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function parseRetryAfterSeconds(errorDetails: unknown): number | undefined {
  if (!Array.isArray(errorDetails)) return undefined;
  for (const detail of errorDetails) {
    if (!detail || typeof detail !== "object") continue;
    const maybeRetryDelay = (detail as { retryDelay?: unknown }).retryDelay;
    if (typeof maybeRetryDelay !== "string") continue;
    const match = maybeRetryDelay.match(/(\d+)/);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function parseGeminiJson(raw: string): ExtractionResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

export class GeminiProvider implements LLMExtractionProvider {
  readonly name = "gemini";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extractFromFile(
    base64Data: string,
    mimeType: string,
    prompt: string
  ): Promise<ExtractionResult> {
    return this.call([
      { inline_data: { mime_type: mimeType, data: base64Data } },
      { text: prompt },
    ]);
  }

  async extractFromText(
    text: string,
    prompt: string
  ): Promise<ExtractionResult> {
    return this.call([{ text: `${prompt}\n\nDocument text:\n${text}` }]);
  }

  private async call(parts: unknown[]): Promise<ExtractionResult> {
    const resp = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    const gemini = (await resp.json()) as {
      error?: { message: string; status?: string; details?: unknown };
      candidates?: { content: { parts: { text: string }[] } }[];
    };

    if (!resp.ok || gemini.error) {
      if (
        resp.status === 429 ||
        gemini.error?.status === "RESOURCE_EXHAUSTED"
      ) {
        throw new ProviderQuotaError(
          this.name,
          parseRetryAfterSeconds(gemini.error?.details)
        );
      }
      throw new Error("gemini_error");
    }

    const raw =
      gemini.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseGeminiJson(raw);
  }
}

// ── Bedrock Claude provider ──────────────────────────────────────────────────

/**
 * Wraps the existing bedrockExtractionService.
 * Only instantiated when BEDROCK_ENABLED=true.
 */
export class BedrockClaudeProvider implements LLMExtractionProvider {
  readonly name = "bedrock_claude";

  async extractFromFile(
    base64Data: string,
    mimeType: string,
    _prompt: string
  ): Promise<ExtractionResult> {
    const isPdf = mimeType === "application/pdf";
    const fileBuffer = Buffer.from(base64Data, "base64");

    let imageBytes: Buffer;
    let imageMime: string;

    if (isPdf) {
      const rendered = this.pdfFirstPageToImage(fileBuffer);
      if (!rendered) throw new Error("pdf_render_failed");
      imageBytes = rendered as Buffer;
      imageMime = "image/png";
    } else {
      imageBytes = fileBuffer;
      imageMime = mimeType;
    }

    const { extractVoucherFieldsFromImage } = await import(
      "./bedrockExtractionService"
    );
    const result = await extractVoucherFieldsFromImage(
      imageBytes,
      imageMime
    );
    const { warnings, confidencePerField, ...extraction } = result;
    return extraction;
  }

  async extractFromText(
    text: string,
    _prompt: string
  ): Promise<ExtractionResult> {
    const { extractVoucherFields } = await import(
      "./bedrockExtractionService"
    );
    const result = await extractVoucherFields(text, {});
    const { warnings, confidencePerField, ...extraction } = result;
    return extraction;
  }

  /** Convert the first page of a PDF to a PNG buffer via pdftoppm. */
  private pdfFirstPageToImage(pdfBuffer: Buffer): Buffer | null {
    const popplerPath = process.env.POPPLER_PATH ?? "/usr/bin";
    const workDir = join(tmpdir(), `bedrock_pdf_${Date.now()}`);
    mkdirSync(workDir, { recursive: true });
    try {
      const inputPath = join(workDir, "input.pdf");
      writeFileSync(inputPath, pdfBuffer);
      execSync(
        `${popplerPath}/pdftoppm -png -r 250 -f 1 -l 1 "${inputPath}" "${join(
          workDir,
          "page"
        )}"`,
        { stdio: "pipe" }
      );
      const pages = readdirSync(workDir)
        .filter((f) => f.endsWith(".png"))
        .sort();
      return pages.length > 0 ? readFileSync(join(workDir, pages[0])) : null;
    } catch (err) {
      console.warn("pdftoppm failed:", err);
      return null;
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the active LLM provider based on environment configuration.
 *
 * Returns null if no provider can be configured (e.g. missing API key
 * and Bedrock not enabled).
 */
export function createProvider(): LLMExtractionProvider | null {
  if (process.env.BEDROCK_ENABLED === "true") {
    return new BedrockClaudeProvider();
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GeminiProvider(apiKey);
}
