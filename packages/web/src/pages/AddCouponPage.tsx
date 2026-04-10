import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { api } from "../services/api";
import {
  getExtractionSuggestion,
  mergeExtraction,
} from "@coupon/shared";
import type { CouponCategory, ExtractionResult } from "@coupon/shared";
import styles from "./addCoupon.module.css";

const CATEGORIES: CouponCategory[] = [
  "food", "retail", "travel", "entertainment", "health", "tech", "other",
];

type FormState = {
  code: string;
  title: string;
  description: string;
  store: string;
  category: CouponCategory;
  discountType: "percentage" | "fixed";
  discountValue: string;
  faceValue: string;
  cost: string;
  currency: string;
  expiresAt: string;
  eventDate: string;
  seatInfo: string;
  conditions: string;
  quantity: string;
  maxUsage: string;
  qrCode: string;
};

const EMPTY_FORM: FormState = {
  code: "", title: "", description: "", store: "",
  category: "other", discountType: "percentage", discountValue: "",
  faceValue: "", cost: "", currency: "ILS",
  expiresAt: "", eventDate: "", seatInfo: "", conditions: "",
  quantity: "", maxUsage: "", qrCode: "",
};

function parseUsageLimit(usageLimit: string | undefined): number | undefined {
  if (!usageLimit) return undefined;
  if (usageLimit === "one-time") return 1;
  if (usageLimit === "multi-use") return undefined;
  const m = usageLimit.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function applyExtraction(extracted: ExtractionResult): { form: Partial<FormState>; itemType: "coupon" | "voucher" } {
  const itemType = extracted.itemType ?? "coupon";
  const form: Partial<FormState> = {};

  if (extracted.title) form.title = extracted.title;
  if (extracted.store) form.store = extracted.store;
  if (extracted.code) form.code = extracted.code;
  if (extracted.description) form.description = extracted.description;
  if (extracted.category) form.category = extracted.category;
  if (extracted.conditions) form.conditions = extracted.conditions;
  if (extracted.seatInfo) form.seatInfo = extracted.seatInfo;
  if (extracted.quantity) form.quantity = String(extracted.quantity);
  if (extracted.currency) form.currency = extracted.currency;
  if (extracted.faceValue) form.faceValue = String(extracted.faceValue);
  if (extracted.cost) form.cost = String(extracted.cost);
  if (extracted.expiresAt) form.expiresAt = extracted.expiresAt.slice(0, 10);
  if (extracted.eventDate) form.eventDate = extracted.eventDate.slice(0, 10);
  const maxUsage = parseUsageLimit(extracted.usageLimit);
  if (maxUsage !== undefined) form.maxUsage = String(maxUsage);

  if (extracted.discount) {
    form.discountType = extracted.discount.type as "percentage" | "fixed";
    form.discountValue = String(extracted.discount.value);
    if (extracted.discount.type === "fixed") form.currency = extracted.discount.currency;
  }

  return { form, itemType };
}

export default function AddCouponPage() {
  const navigate = useNavigate();
  const [itemType, setItemType] = useState<"coupon" | "voucher">("coupon");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [aiSuggestion, setAiSuggestion] = useState<"coupon" | "voucher" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractWarning, setExtractWarning] = useState<string | null>(null);
  const [extractHint, setExtractHint] = useState<string | null>(null);
  const [manualFallbackHint, setManualFallbackHint] = useState<string | null>(null);
  const [qrImageS3Key, setQrImageS3Key] = useState<string | undefined>(undefined);
  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const applyAiExtraction = (
    extracted: ExtractionResult | undefined,
    warnings?: string[],
    s3Key?: string
  ) => {
    if (!extracted) {
      throw new Error("AI returned an invalid extraction response");
    }

    const { form: extractedForm, itemType: extractedType } = applyExtraction(extracted);
    setForm((current) => mergeExtraction(current, extractedForm, EMPTY_FORM));
    setAiSuggestion(getExtractionSuggestion(itemType, extractedType));
    setExtractWarning(
      warnings?.includes("language_validation_failed")
        ? "AI may have translated some fields. Please verify before saving."
        : null
    );
    if (s3Key) setQrImageS3Key(s3Key);
  };

  const decodeQrFromImage = async (file: File): Promise<string | null> => {
    const imageUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Unable to read image"));
        img.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(imageData.data, imageData.width, imageData.height)?.data ?? null;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleExtractFile = async (file: File) => {
    setExtractError(null);
    setExtractWarning(null);
    setExtractHint(null);
    setManualFallbackHint(null);
    setExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve(result.split(",")[1]); // strip data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const isImage = file.type.startsWith("image/");
      if (!isImage) {
        setExtractHint("QR extraction works best from photos or screenshots. PDF QR decoding is skipped for MVP.");
      }

      const [aiResult, qrResult] = await Promise.allSettled([
        api.ai.extract({ data: base64, mimeType: file.type }),
        isImage ? decodeQrFromImage(file) : Promise.resolve(null),
      ]);

      if (aiResult.status === "fulfilled") {
        applyAiExtraction(aiResult.value.extraction, aiResult.value.warnings, aiResult.value.qrImageS3Key);
      } else {
        throw aiResult.reason;
      }

      const qrCode = qrResult.status === "fulfilled" && typeof qrResult.value === "string"
        ? qrResult.value
        : undefined;
      if (qrCode) {
        setForm((current) => mergeExtraction(current, { qrCode }, EMPTY_FORM));
      }
    } catch (err: any) {
      const message = err.message ?? "Extraction failed";
      setExtractError(message);
      if (/temporarily unavailable|manually/i.test(message)) {
        setManualFallbackHint("Scanning is temporarily unavailable right now. You can still fill in the form manually below and save the voucher.");
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractText = async () => {
    if (!pasteText.trim()) return;
    setExtractError(null);
    setExtractWarning(null);
    setExtractHint(null);
    setManualFallbackHint(null);
    setExtracting(true);
    try {
      const response = await api.ai.extract({ text: pasteText });
      applyAiExtraction(response.extraction, response.warnings, response.qrImageS3Key);
      setShowPaste(false);
    } catch (err: any) {
      const message = err.message ?? "Extraction failed";
      setExtractError(message);
      if (/temporarily unavailable|manually/i.test(message)) {
        setManualFallbackHint("Scanning is temporarily unavailable right now. You can still fill in the form manually below and save the voucher.");
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.coupons.create({
        itemType,
        code: form.code,
        title: form.title,
        description: form.description || undefined,
        store: form.store,
        category: form.category,
        ...(itemType === "coupon" && form.discountValue
          ? {
              discount:
                form.discountType === "percentage"
                  ? { type: "percentage", value: parseFloat(form.discountValue) }
                  : { type: "fixed", value: parseFloat(form.discountValue), currency: form.currency || "ILS" },
            }
          : {}),
        ...(itemType === "voucher" && form.faceValue
          ? {
              faceValue: parseFloat(form.faceValue),
              cost: form.cost ? parseFloat(form.cost) : undefined,
              currency: form.currency || undefined,
            }
          : {}),
        expiresAt: form.expiresAt || undefined,
        eventDate: form.eventDate || undefined,
        seatInfo: form.seatInfo || undefined,
        conditions: form.conditions || undefined,
        quantity: form.quantity ? parseInt(form.quantity, 10) : undefined,
        maxUsage: form.maxUsage ? parseInt(form.maxUsage, 10) : undefined,
        qrCode: form.qrCode || undefined,
        qrImageS3Key: qrImageS3Key || undefined,
      });
      navigate(`/?type=${itemType}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Add to Vault</h1>
        <p className={styles.subtitle}>Save a coupon or voucher.</p>
      </div>

      {/* AI extraction */}
      <div className={styles.extractCard}>
        <p className={styles.extractHeading}>Scan or paste to auto-fill</p>
        <p className={styles.extractHint}>For QR extraction, images and screenshots work best. PDF QR decoding is skipped for now.</p>
        <div className={styles.extractActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            className={styles.hidden}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleExtractFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={styles.extractBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting}
          >
            Upload PDF / Image
          </button>
          <button
            type="button"
            className={styles.extractBtn}
            onClick={() => setShowPaste((v) => !v)}
            disabled={extracting}
          >
            Paste text
          </button>
        </div>
        {showPaste && (
          <div className={styles.pasteArea}>
            <textarea
              className={styles.textarea}
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste email or voucher text here…"
            />
            <button
              type="button"
              className={styles.extractRunBtn}
              onClick={handleExtractText}
              disabled={extracting || !pasteText.trim()}
            >
              {extracting ? "Extracting…" : "Extract →"}
            </button>
          </div>
        )}
        {extracting && !showPaste && (
          <p className={styles.extractStatus}>Extracting…</p>
        )}
        {extractHint && <p className={styles.extractHint}>{extractHint}</p>}
        {extractWarning && <p className={styles.extractWarning}>{extractWarning}</p>}
        {extractError && <p className={styles.extractError}>{extractError}</p>}
        {manualFallbackHint && <p className={styles.extractManualHint}>{manualFallbackHint}</p>}
      </div>

      <div className={styles.card}>
        {error && <p className={styles.error}>{error}</p>}

        {/* Type selector */}
        <div className={styles.typeToggle}>
          <button
            type="button"
            className={`${styles.typeBtn}${itemType === "coupon" ? ` ${styles.typeBtnActive}` : ""}`}
            onClick={() => setItemType("coupon")}
          >
            Coupon
          </button>
          <button
            type="button"
            className={`${styles.typeBtn}${itemType === "voucher" ? ` ${styles.typeBtnActive}` : ""}`}
            onClick={() => setItemType("voucher")}
          >
            Voucher
          </button>
        </div>

        {aiSuggestion && (
          <div className={styles.suggestionBanner}>
            <p className={styles.suggestionText}>
              AI thinks this looks like a {aiSuggestion}.
            </p>
            <div className={styles.suggestionActions}>
              <button
                type="button"
                className={styles.suggestionPrimary}
                onClick={() => {
                  setItemType(aiSuggestion);
                  setAiSuggestion(null);
                }}
              >
                Switch to {aiSuggestion === "voucher" ? "Voucher" : "Coupon"}
              </button>
              <button
                type="button"
                className={styles.suggestionDismiss}
                onClick={() => setAiSuggestion(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Title
            <input
              className={styles.input}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={itemType === "coupon" ? "e.g. 20% off summer sale" : "e.g. Domino's — two family pizzas"}
              required
            />
          </label>

          <label className={styles.label}>
            Code / Barcode
            <input
              className={styles.input}
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="e.g. SUMMER20 or 2360647438"
              required
            />
          </label>

          <label className={styles.label}>
            Store / Vendor
            <input
              className={styles.input}
              value={form.store}
              onChange={(e) => set("store", e.target.value)}
              placeholder="e.g. Domino's"
              required
            />
          </label>

          <label className={styles.label}>
            Category
            <select
              className={styles.select}
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </label>

          {itemType === "coupon" && (
            <label className={styles.label}>
              Discount
              <div className={styles.discountRow}>
                <select
                  className={styles.select}
                  value={form.discountType}
                  onChange={(e) => set("discountType", e.target.value as "percentage" | "fixed")}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed amount</option>
                </select>
                <input
                  className={styles.input}
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => set("discountValue", e.target.value)}
                  placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 50"}
                  min="0"
                />
              </div>
            </label>
          )}

          {itemType === "voucher" && (
            <>
              <label className={styles.label}>
                Face value (what you get)
                <input
                  className={styles.input}
                  type="number"
                  value={form.faceValue}
                  onChange={(e) => set("faceValue", e.target.value)}
                  placeholder="e.g. 200 (leave blank for item vouchers)"
                  min="0"
                />
              </label>
              <label className={styles.label}>
                Cost (what you paid)
                <input
                  className={styles.input}
                  type="number"
                  value={form.cost}
                  onChange={(e) => set("cost", e.target.value)}
                  placeholder="e.g. 100 (leave blank if gifted)"
                  min="0"
                />
              </label>
              <label className={styles.label}>
                Currency
                <input
                  className={styles.input}
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  placeholder="e.g. ILS, USD"
                />
              </label>
            </>
          )}

          <label className={styles.label}>
            Description
            <textarea
              className={styles.textarea}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional notes…"
            />
          </label>

          <div className={styles.optionalSection}>
            <p className={styles.optionalHeading}>Optional details</p>

            <label className={styles.label}>
              Expiry Date
              <input className={styles.input} type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
            </label>

            {itemType === "voucher" && (
              <>
                <label className={styles.label}>
                  Event Date
                  <input className={styles.input} type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
                </label>
                <label className={styles.label}>
                  Seat / Location info
                  <input
                    className={styles.input}
                    value={form.seatInfo}
                    onChange={(e) => set("seatInfo", e.target.value)}
                    placeholder="e.g. Row 7, Seats 1-2"
                  />
                </label>
                <label className={styles.label}>
                  Quantity
                  <input className={styles.input} type="number" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="e.g. 2" min="1" />
                </label>
              </>
            )}

            <label className={styles.label}>
              Conditions / Restrictions
              <input
                className={styles.input}
                value={form.conditions}
                onChange={(e) => set("conditions", e.target.value)}
                placeholder="e.g. Valid at Rami Levi branches only"
              />
            </label>

            <label className={styles.label}>
              Max uses
              <input className={styles.input} type="number" value={form.maxUsage} onChange={(e) => set("maxUsage", e.target.value)} placeholder="e.g. 1" min="1" />
            </label>

            <label className={styles.label}>
              QR Code / Barcode data
              <input className={styles.input} value={form.qrCode} onChange={(e) => set("qrCode", e.target.value)} placeholder="e.g. barcode data or URL" />
            </label>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? "Saving…" : `Save ${itemType === "coupon" ? "Coupon" : "Voucher"}`}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={() => navigate(`/?type=${itemType}`)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
