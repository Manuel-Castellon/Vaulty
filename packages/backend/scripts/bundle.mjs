import * as esbuild from "esbuild";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const functions = [
  { name: "ListCouponsFunction",   entry: "src/functions/coupons/list.ts",         out: "list.js" },
  { name: "GetCouponFunction",     entry: "src/functions/coupons/get.ts",          out: "get.js" },
  { name: "CreateCouponFunction",  entry: "src/functions/coupons/create.ts",       out: "create.js" },
  { name: "UpdateCouponFunction",  entry: "src/functions/coupons/update.ts",       out: "update.js" },
  { name: "DeleteCouponFunction",  entry: "src/functions/coupons/delete.ts",       out: "delete.js" },
  { name: "GetUploadUrlFunction",  entry: "src/functions/upload/presigned-url.ts", out: "presigned-url.js" },
  { name: "ExpiryCheckFunction",    entry: "src/functions/notifications/expiry-check.ts",    out: "expiry-check.js" },
  { name: "RegisterTokenFunction",         entry: "src/functions/notifications/register-token.ts",  out: "register-token.js" },
  { name: "NotificationPreferencesFunction", entry: "src/functions/notifications/preferences.ts",      out: "preferences.js" },
  { name: "ExtractFunction",      entry: "src/functions/ai/extract.ts",               out: "extract.js" },
  { name: "SearchFunction",       entry: "src/functions/ai/search.ts",                out: "search.js" },
  // Metrics
  { name: "SignUpNotificationFunction", entry: "src/functions/metrics/signup-notification.ts", out: "signup-notification.js" },
  { name: "MetricsDigestFunction",      entry: "src/functions/metrics/metrics-digest.ts",      out: "metrics-digest.js" },
  // Sharing
  { name: "ShareCouponFunction",   entry: "src/functions/sharing/share.ts",          out: "share.js" },
  { name: "SharedPreviewFunction", entry: "src/functions/sharing/shared-preview.ts", out: "shared-preview.js" },
  { name: "ClaimCouponFunction",   entry: "src/functions/sharing/claim.ts",          out: "claim.js" },
];

// Functions that use jimp/jsqr need those packages bundled (they are NOT
// available in the Lambda runtime). All @aws-sdk/* clients remain external
// because the Lambda Node.js 24 runtime ships the full AWS SDK v3.
const NEEDS_IMAGE_DEPS = new Set(["ExtractFunction"]);

for (const fn of functions) {
  const outDir = resolve(root, "dist", fn.name);
  mkdirSync(outDir, { recursive: true });
  await esbuild.build({
    entryPoints: [resolve(root, fn.entry)],
    bundle: true,
    platform: "node",
    target: "es2020",
    // jimp/jsqr are only bundled for functions that need them to keep
    // other function bundles small.
    external: NEEDS_IMAGE_DEPS.has(fn.name)
      ? ["@aws-sdk/*"]
      : ["@aws-sdk/*", "jimp", "jsqr"],
    outfile: resolve(outDir, fn.out),
  });
  console.log(`bundled ${fn.name}`);
}
