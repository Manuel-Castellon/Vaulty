const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filePath,
  });

  const loadedModule = new Module(filePath, module);
  loadedModule.filename = filePath;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filePath));
  loadedModule._compile(transpiled.outputText, filePath);
  return loadedModule.exports;
}

const { mergeExtraction, getExtractionSuggestion } = loadTsModule(path.join(__dirname, "extractionMerge.ts"));
const { normalizeExtractResponse } = loadTsModule(path.join(__dirname, "extractResponse.ts"));

const EMPTY_FORM = {
  title: "",
  store: "",
  category: "other",
  discountValue: "",
  qrCode: "",
};

test("mergeExtraction fills empty fields only", () => {
  const current = {
    title: "",
    store: "Dominos",
    category: "other",
    discountValue: "",
    qrCode: "",
  };

  const merged = mergeExtraction(
    current,
    {
      title: "פיצה משפחתית",
      store: "דומינוס",
      category: "food",
      discountValue: "20",
      qrCode: "abc123",
    },
    EMPTY_FORM
  );

  assert.deepEqual(merged, {
    title: "פיצה משפחתית",
    store: "Dominos",
    category: "food",
    discountValue: "20",
    qrCode: "abc123",
  });
});

test("mergeExtraction does not overwrite user-entered values", () => {
  const current = {
    title: "Custom title",
    store: "Custom store",
    category: "food",
    discountValue: "50",
    qrCode: "manual-code",
  };

  const merged = mergeExtraction(
    current,
    {
      title: "AI title",
      store: "AI store",
      category: "retail",
      discountValue: "10",
      qrCode: "ai-code",
    },
    EMPTY_FORM
  );

  assert.deepEqual(merged, current);
});

test("getExtractionSuggestion only suggests when AI differs from user intent", () => {
  assert.equal(getExtractionSuggestion("coupon", "coupon"), null);
  assert.equal(getExtractionSuggestion("voucher", "voucher"), null);
  assert.equal(getExtractionSuggestion("coupon", "voucher"), "voucher");
  assert.equal(getExtractionSuggestion("voucher", "coupon"), "coupon");
  assert.equal(getExtractionSuggestion("coupon", undefined), null);
});

test("normalizeExtractResponse accepts both envelope and legacy extraction shapes", () => {
  assert.deepEqual(
    normalizeExtractResponse({ extraction: { itemType: "voucher", title: "Dinner" }, warnings: ["language_validation_failed"] }),
    { extraction: { itemType: "voucher", title: "Dinner" }, warnings: ["language_validation_failed"] }
  );

  assert.deepEqual(
    normalizeExtractResponse({ itemType: "coupon", title: "20% Off" }),
    { extraction: { itemType: "coupon", title: "20% Off" } }
  );
});
