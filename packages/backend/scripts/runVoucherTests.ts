/**
 * Voucher extraction test runner.
 *
 * Usage:
 *   npm run test:vouchers                    # all fixtures
 *   npm run test:vouchers -- --file foo.txt  # single file
 *   npm run test:vouchers -- --bedrock       # force Bedrock path
 *
 * For real image/PDF files in tests/vouchers/:
 *   - Images and PDFs are uploaded to S3 and run through the full pipeline.
 *   - Text files (.txt) are sent directly to Bedrock (no Textract step).
 *
 * Results are written to tests/results/<filename>.json.
 *
 * Requires AWS credentials with Textract, Bedrock, and S3 permissions.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join, extname, basename } from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { extractVoucherFields } from "../src/services/bedrockExtractionService";
import { runExtractionPipeline } from "../src/services/extractionPipeline";

// ── Config ──────────────────────────────────────────────────────────────────

const BUCKET = process.env.IMAGES_BUCKET;
const REGION = process.env.REGION ?? "us-east-1";
const VOUCHERS_DIR = join(__dirname, "../tests/vouchers");
const RESULTS_DIR = join(__dirname, "../tests/results");

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
};

const s3 = new S3Client({ region: REGION });

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  return {
    targetFile: fileIdx >= 0 ? args[fileIdx + 1] : undefined,
    forceBedrock: args.includes("--bedrock"),
  };
}

async function uploadTempToS3(buffer: Buffer, key: string, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET!, Key: key, Body: buffer, ContentType: contentType })
  );
}

async function deleteTempFromS3(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }));
  } catch {
    /* non-fatal */
  }
}

function getMimeType(filePath: string): string {
  return MIME_MAP[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (MIME_MAP[extname(entry.name).toLowerCase()]) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

// ── Per-file processing ───────────────────────────────────────────────────────

interface TestResult {
  file: string;
  status: "ok" | "error";
  durationMs: number;
  output?: unknown;
  error?: string;
}

async function processFile(filePath: string): Promise<TestResult> {
  const fileName = basename(filePath);
  const mimeType = getMimeType(filePath);
  const start = Date.now();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Processing: ${fileName} (${mimeType})`);
  console.log(`${"─".repeat(60)}`);

  try {
    let output: unknown;

    if (mimeType === "text/plain") {
      // Text files: skip Textract, go straight to Bedrock
      const text = readFileSync(filePath, "utf-8");
      console.log("  → Text-only mode (no Textract)");
      const result = await extractVoucherFields(text, {});
      output = result;
    } else {
      // Image / PDF: full pipeline
      if (!BUCKET) {
        throw new Error("IMAGES_BUCKET env var required for image/PDF processing");
      }
      const fileBuffer = readFileSync(filePath);
      const tempKey = `test-runs/${Date.now()}_${fileName}`;
      await uploadTempToS3(fileBuffer, tempKey, mimeType);
      console.log(`  → Uploaded to S3: ${tempKey}`);

      try {
        output = await runExtractionPipeline({ s3Key: tempKey, mimeType });
      } finally {
        await deleteTempFromS3(tempKey);
      }
    }

    const durationMs = Date.now() - start;
    console.log(`  ✓ Done in ${durationMs} ms`);
    console.log("  Output:", JSON.stringify(output, null, 2));

    return { file: fileName, status: "ok", durationMs, output };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Failed: ${error}`);
    return { file: fileName, status: "error", durationMs, error };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { targetFile } = parseArgs();

  mkdirSync(RESULTS_DIR, { recursive: true });

  const allFiles = collectFiles(VOUCHERS_DIR);
  const filesToProcess = targetFile
    ? allFiles.filter((f) => basename(f) === targetFile || f.endsWith(targetFile))
    : allFiles;

  if (filesToProcess.length === 0) {
    console.error("No matching test files found.");
    console.error("Place voucher files (JPG, PNG, PDF, TXT) in:", VOUCHERS_DIR);
    process.exit(1);
  }

  console.log(`\nRunning extraction on ${filesToProcess.length} file(s)…\n`);

  const summary: TestResult[] = [];

  for (const filePath of filesToProcess) {
    const result = await processFile(filePath);
    summary.push(result);

    // Write individual result
    const outName = basename(filePath).replace(/\.[^.]+$/, ".json");
    const outPath = join(RESULTS_DIR, outName);
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`  Saved → ${outPath}`);
  }

  // Print summary table
  console.log(`\n${"═".repeat(60)}`);
  console.log("SUMMARY");
  console.log(`${"═".repeat(60)}`);
  for (const r of summary) {
    const status = r.status === "ok" ? "✓" : "✗";
    console.log(`  ${status} ${r.file.padEnd(40)} ${r.durationMs} ms`);
  }

  const failed = summary.filter((r) => r.status === "error").length;
  console.log(`\n${summary.length} tests, ${failed} failed.\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
