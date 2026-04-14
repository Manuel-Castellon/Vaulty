/**
 * Lightweight structured logger for Lambda functions.
 *
 * Outputs JSON to stdout — CloudWatch Logs natively parses it,
 * enabling CloudWatch Insights queries over structured fields.
 *
 * Usage:
 *   log("info", "extract.completed", { provider: "gemini", durationMs: 1234 });
 */

export type LogLevel = "info" | "warn" | "error";

export function log(
  level: LogLevel,
  event: string,
  fields?: Record<string, unknown>
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  // Use the matching console method so CloudWatch captures the correct severity
  console[level](JSON.stringify(entry));
}
