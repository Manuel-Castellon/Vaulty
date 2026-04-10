/**
 * QR code extraction service.
 *
 * For images: detects QR code region using jsQR, crops it with jimp,
 * and saves the crop to S3 for later decoding.
 *
 * For PDFs: QR extraction requires converting PDF pages to raster images,
 * which needs poppler-utils (pdftoppm) available in the Lambda execution
 * environment. If poppler is not available this step is skipped gracefully.
 * To enable: add a Lambda Layer containing poppler-utils binaries for
 * Amazon Linux 2 and set POPPLER_PATH=/opt/bin in the function environment.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from "jimp";
import jsQR from "jsqr";
import { execSync } from "child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const s3 = new S3Client({ region: process.env.REGION ?? "us-east-1" });
const BUCKET = process.env.IMAGES_BUCKET!;

export interface QRExtractionResult {
  /** S3 key of the saved QR crop image, or null if not found */
  qrImageS3Key: string | null;
  /** Raw decoded QR data if jsQR successfully decoded it */
  qrData: string | null;
}

/** Upload a buffer to S3 and return the key */
async function uploadToS3(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Detect QR code in raw image bytes and save the cropped region to S3.
 * Returns null if no QR code is found.
 */
async function detectAndCropQR(
  imageBytes: Buffer,
  outputKeyPrefix: string
): Promise<QRExtractionResult> {
  const image = await Jimp.read(imageBytes);
  const { width, height } = image.bitmap;

  // jsQR needs a flat RGBA Uint8ClampedArray
  const rawData = image.bitmap.data;
  const clampedData = new Uint8ClampedArray(
    rawData.buffer,
    rawData.byteOffset,
    rawData.byteLength
  );

  const qr = jsQR(clampedData, width, height, {
    inversionAttempts: "attemptBoth",
  });

  if (!qr) {
    return { qrImageS3Key: null, qrData: null };
  }

  // Compute bounding box with padding
  const xs = [
    qr.location.topLeftCorner.x,
    qr.location.topRightCorner.x,
    qr.location.bottomLeftCorner.x,
    qr.location.bottomRightCorner.x,
  ];
  const ys = [
    qr.location.topLeftCorner.y,
    qr.location.topRightCorner.y,
    qr.location.bottomLeftCorner.y,
    qr.location.bottomRightCorner.y,
  ];

  const padding = 20;
  const cropX = Math.max(0, Math.floor(Math.min(...xs)) - padding);
  const cropY = Math.max(0, Math.floor(Math.min(...ys)) - padding);
  const cropW = Math.min(width - cropX, Math.ceil(Math.max(...xs) - Math.min(...xs)) + padding * 2);
  const cropH = Math.min(height - cropY, Math.ceil(Math.max(...ys) - Math.min(...ys)) + padding * 2);

  const cropped = image.clone().crop(cropX, cropY, cropW, cropH);
  const pngBuffer = await cropped.getBufferAsync(Jimp.MIME_PNG);

  const s3Key = `${outputKeyPrefix}_qr.png`;
  await uploadToS3(pngBuffer, s3Key, "image/png");
  console.log(`QR crop saved to S3: ${s3Key}, data: ${qr.data.slice(0, 80)}`);

  return { qrImageS3Key: s3Key, qrData: qr.data };
}

/**
 * Check if poppler-utils (pdftoppm) is available.
 * Required to convert PDF pages → images for QR scanning.
 */
function isPopplerAvailable(): boolean {
  const popplerPath = process.env.POPPLER_PATH ?? "/usr/bin";
  try {
    execSync(`${popplerPath}/pdftoppm -v 2>&1`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a PDF buffer to a list of PNG page image buffers using pdftoppm.
 * Requires poppler-utils to be installed in the Lambda environment.
 */
function pdfToImages(pdfBuffer: Buffer): Buffer[] {
  const popplerPath = process.env.POPPLER_PATH ?? "/usr/bin";
  const workDir = join(tmpdir(), `qr_pdf_${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  try {
    const inputPath = join(workDir, "input.pdf");
    require("fs").writeFileSync(inputPath, pdfBuffer);

    const outputPrefix = join(workDir, "page");
    execSync(
      `${popplerPath}/pdftoppm -png -r 250 "${inputPath}" "${outputPrefix}"`,
      { stdio: "pipe" }
    );

    const pageFiles = readdirSync(workDir)
      .filter((f) => f.endsWith(".png"))
      .sort();

    return pageFiles.map((f) => readFileSync(join(workDir, f)));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Scan an image for a QR code and save the crop to S3.
 * Returns null qrImageS3Key if no QR is found.
 */
export async function extractQRFromImage(
  imageBytes: Buffer,
  outputKeyPrefix: string
): Promise<QRExtractionResult> {
  try {
    return await detectAndCropQR(imageBytes, outputKeyPrefix);
  } catch (err) {
    console.warn("QR extraction failed (image):", err);
    return { qrImageS3Key: null, qrData: null };
  }
}

/**
 * Scan a PDF for QR codes by converting pages to images.
 * Requires poppler-utils in the Lambda environment (see POPPLER_PATH env var).
 * Gracefully returns null if poppler is not available.
 */
export async function extractQRFromPdf(
  pdfBuffer: Buffer,
  outputKeyPrefix: string
): Promise<QRExtractionResult> {
  if (!isPopplerAvailable()) {
    console.warn(
      "poppler-utils not available — QR extraction from PDFs skipped. " +
        "Add a Lambda Layer with poppler binaries and set POPPLER_PATH=/opt/bin."
    );
    return { qrImageS3Key: null, qrData: null };
  }

  try {
    const pageImages = pdfToImages(pdfBuffer);
    for (let i = 0; i < pageImages.length; i++) {
      const result = await detectAndCropQR(
        pageImages[i],
        `${outputKeyPrefix}_p${i + 1}`
      );
      if (result.qrImageS3Key) return result;
    }
    return { qrImageS3Key: null, qrData: null };
  } catch (err) {
    console.warn("QR extraction failed (PDF):", err);
    return { qrImageS3Key: null, qrData: null };
  }
}
