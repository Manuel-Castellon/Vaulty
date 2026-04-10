# Fallback AI Backlog

Later mission: evaluate additional free-tier extraction/search APIs that can act as fallbacks when Gemini free-tier quota is exhausted.

Initial scope:
- Require a genuinely free tier or sustainably free quota for low-volume MVP usage
- Support image and PDF extraction, or at minimum OCR plus structured extraction
- Preserve original language/script reliably
- Allow backend-side usage from AWS Lambda without heavyweight infrastructure changes

Candidate evaluation criteria:
- Rate limits and reset windows
- OCR quality on Hebrew voucher PDFs
- Structured JSON adherence
- Latency from `us-east-1`
- Long-term viability of the free plan
