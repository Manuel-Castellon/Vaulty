import type { ExtractResponse, ExtractionResult } from "../types/api";

export function normalizeExtractResponse(
  response: ExtractResponse | ExtractionResult
): ExtractResponse {
  if ("extraction" in response) {
    return response;
  }

  return { extraction: response };
}
