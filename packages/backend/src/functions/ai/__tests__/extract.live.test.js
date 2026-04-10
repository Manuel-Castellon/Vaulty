const fs = require("node:fs");
const path = require("node:path");
const { handler } = require("../extract.ts");

const examplesDir = path.resolve(__dirname, "../../../../../../examples");
const envFile = path.resolve(__dirname, "../../../../env.json");
const LIVE_CASES = [
  {
    fileName: "dominos.pdf",
    expected: {
      itemType: "voucher",
      titleIncludes: "דומינו",
      code: "2360647438",
      expiresAt: "2026-12-31",
    },
  },
  {
    fileName: "castro.pdf",
    expected: {
      itemType: "voucher",
      titleIncludes: "קסטרו",
      code: "1392262402525",
      expiresAt: "2030-12-22",
      faceValueAtLeast: 200,
      costAtMost: 100,
    },
  },
];

function loadGeminiKey() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  const parsed = JSON.parse(fs.readFileSync(envFile, "utf8"));
  return parsed?.Parameters?.GeminiApiKey;
}

function hasMeaningfulExtraction(extraction) {
  return Boolean(
    extraction.title ||
    extraction.store ||
    extraction.code ||
    extraction.description ||
    extraction.discount ||
    extraction.faceValue ||
    extraction.cost ||
    extraction.expiresAt ||
    extraction.eventDate ||
    extraction.conditions
  );
}

function scriptLooksConsistent(extraction) {
  const script = extraction.sourceScript;
  if (!script || script === "latin" || script === "other") {
    return true;
  }

  const patterns = {
    hebrew: /[\u0590-\u05FF]/,
    arabic: /[\u0600-\u06FF]/,
    cjk: /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/,
    cyrillic: /[\u0400-\u04FF]/,
  };

  const pattern = patterns[script];
  if (!pattern) {
    return true;
  }

  for (const field of ["title", "store", "description", "conditions", "seatInfo"]) {
    const value = extraction[field];
    if (typeof value !== "string" || value.trim() === "") {
      continue;
    }

    if (pattern.test(value) || !/[A-Za-z]/.test(value)) {
      continue;
    }

    return false;
  }

  return true;
}

const maybeDescribe = process.env.RUN_LIVE_GEMINI_TESTS === "1" ? describe : describe.skip;

maybeDescribe("live Gemini extraction smoke", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = loadGeminiKey();
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY for live extraction tests");
    }
  });

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalKey;
  });

  test.each(LIVE_CASES)("extracts $fileName with expected core fields", async ({ fileName, expected }) => {
    const pdf = fs.readFileSync(path.join(examplesDir, fileName));
    const response = await handler({
      body: JSON.stringify({
        data: pdf.toString("base64"),
        mimeType: "application/pdf",
      }),
      requestContext: {},
    });

    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body).toHaveProperty("extraction");
    expect(body.extraction).toBeTruthy();
    expect(hasMeaningfulExtraction(body.extraction)).toBe(true);

    if (body.warnings?.includes("language_validation_failed")) {
      throw new Error(`${fileName}: language validation failed`);
    }

    expect(scriptLooksConsistent(body.extraction)).toBe(true);
    expect(body.extraction.itemType).toBe(expected.itemType);
    expect(body.extraction.title).toContain(expected.titleIncludes);
    expect(body.extraction.code).toBe(expected.code);
    expect(body.extraction.expiresAt).toBe(expected.expiresAt);

    if (expected.faceValueAtLeast !== undefined) {
      expect(body.extraction.faceValue).toBeGreaterThanOrEqual(expected.faceValueAtLeast);
    }
    if (expected.costAtMost !== undefined) {
      expect(body.extraction.cost).toBeLessThanOrEqual(expected.costAtMost);
    }
  }, 30000);
});
