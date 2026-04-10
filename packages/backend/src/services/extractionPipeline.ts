/**
 * Bedrock extraction pipeline (Claude Vision).
 *
 * Used when BEDROCK_ENABLED=true. Passes images directly to Claude via
 * Bedrock — no Textract (confirmed broken for Hebrew).
 *
 * For PDFs: converts pages to images via pdftoppm (requires poppler Lambda
 * Layer), then runs Claude Vision on the first page.
 *
 * QR detection runs via jsQR in parallel with Claude Vision.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { extractVoucherFieldsFromImage } from "./bedrockExtractionService";
import { extractQRFromImage, extractQRFromPdf } from "./qrExtractionService";
import type { ExtractResponse } from "@coupon/shared";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const s3 = new S3Client({ region: process.env.REGION ?? "us-east-1" });
const BUCKET = process.env.IMAGES_BUCKET!;

async function uploadToS3(buffer: Buffer, key: string, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

/** Convert the first page of a PDF to a PNG buffer via pdftoppm. */
function pdfFirstPageToImage(pdfBuffer: Buffer): Buffer | null {
  const popplerPath = process.env.POPPLER_PATH ?? "/usr/bin";
  const workDir = join(tmpdir(), `bedrock_pdf_${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  try {
    const inputPath = join(workDir, "input.pdf");
    writeFileSync(inputPath, pdfBuffer);
    execSync(`${popplerPath}/pdftoppm -png -r 250 -f 1 -l 1 "${inputPath}" "${join(workDir, "page")}"`, { stdio: "pipe" });
    const pages = readdirSync(workDir).filter(f => f.endsWith(".png")).sort();
    return pages.length > 0 ? readFileSync(join(workDir, pages[0])) : null;
  } catch (err) {
    console.warn("pdftoppm failed:", err);
    return null;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export interface PipelineInput {
  data?: string;
  mimeType?: string;
  s3Key?: string;
  text?: string;
}

export async function runExtractionPipeline(input: PipelineInput): Promise<ExtractResponse> {
  const warnings: string[] = [];
  const isPdf = input.mimeType === "application/pdf";
  const qrKeyPrefix = `extractions/qr/${Date.now()}`;

  // ── Text-only fast path ────────────────────────────────────────────────────
  if (input.text) {
    const { extractVoucherFields } = await import("./bedrockExtractionService");
    const ai = await extractVoucherFields(input.text, {});
    if (ai.warnings?.length) warnings.push(...ai.warnings);
    const { warnings: _, confidencePerField, ...extraction } = ai;
    return { extraction, confidencePerField, warnings: warnings.length ? warnings : undefined };
  }

  if (!input.data && !input.s3Key) throw new Error("missing_input");

  const fileBuffer = input.data ? Buffer.from(input.data, "base64") : null;

  // ── Resolve image bytes for Claude Vision ──────────────────────────────────
  let imageBytes: Buffer | null = fileBuffer;
  if (isPdf && fileBuffer) {
    imageBytes = pdfFirstPageToImage(fileBuffer);
    if (!imageBytes) warnings.push("pdf_render_failed");
  }

  if (!imageBytes) {
    return { extraction: {}, warnings: ["no_image_to_process"] };
  }

  const imageMime = isPdf ? "image/png" : (input.mimeType ?? "image/jpeg");

  // ── Claude Vision + QR extraction in parallel ──────────────────────────────
  const [aiResult, qrResult] = await Promise.allSettled([
    extractVoucherFieldsFromImage(imageBytes, imageMime),
    isPdf
      ? extractQRFromPdf(fileBuffer ?? imageBytes, qrKeyPrefix)
      : extractQRFromImage(imageBytes, qrKeyPrefix),
  ]);

  let extraction = {};
  let confidencePerField: Record<string, number> | undefined;

  if (aiResult.status === "fulfilled") {
    const { warnings: aiWarnings, confidencePerField: conf, ...fields } = aiResult.value;
    extraction = fields;
    confidencePerField = conf;
    if (aiWarnings?.length) warnings.push(...aiWarnings);
  } else {
    console.error("Bedrock Vision failed:", aiResult.reason);
    warnings.push("bedrock_vision_failed");
  }

  const qr = qrResult.status === "fulfilled"
    ? qrResult.value
    : { qrImageS3Key: null, qrData: null };

  return {
    extraction,
    qrImageS3Key: qr.qrImageS3Key ?? undefined,
    confidencePerField,
    warnings: warnings.length ? warnings : undefined,
  };
}
