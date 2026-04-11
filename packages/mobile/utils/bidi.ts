/** Returns true if the text contains any Hebrew or Arabic characters. */
export function isRTL(text: string): boolean {
  return /[\u0590-\u05FF\u0600-\u06FF]/.test(text);
}
