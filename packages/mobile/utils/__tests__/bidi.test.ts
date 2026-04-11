import { isRTL } from "../bidi";

describe("isRTL", () => {
  it("returns false for English text", () => {
    expect(isRTL("Pizza discount 10%")).toBe(false);
  });

  it("returns true for Hebrew text", () => {
    expect(isRTL("פיצה הנחה")).toBe(true);
  });

  it("returns true for Arabic text", () => {
    expect(isRTL("خصم بيتزا")).toBe(true);
  });

  it("returns true for mixed Hebrew-English text", () => {
    expect(isRTL("קומבינה 20% OFF")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isRTL("")).toBe(false);
  });

  it("returns false for numbers and symbols", () => {
    expect(isRTL("50% OFF - $20")).toBe(false);
  });
});
