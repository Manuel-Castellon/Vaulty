# MVP Gap Checklist (Prioritized)

Updated: 2026-04-10

## P0 — Launch blockers

1. Android APK / installable build
   - ✅ EAS setup done (`eas.json`, project linkage, `EXPO_TOKEN` in CI/secrets).
   - ✅ CI path added (`.github/workflows/mobile.yml`) for gated Android preview cloud build.
   - ✅ Local Android preflight now passes (`npm run preflight:android`).
   - ⏳ Produce internal test APK/AAB and verify install path end-to-end (cloud Expo build still pending success).

2. Critical Android App Crash
   - ⏳ Removed deprecated `expo-barcode-scanner` and fully transitioned to backend `jsQR` via partial success fallbacks. Pending manual test by Manuel.

3. Password reset flow
   - ✅ Implement forgot/reset password screens and API wiring on web + mobile.
   - ✅ Validate Cognito reset flow and error states (Verified working by Manuel).

## P1 — Important MVP completeness

3. Notification controls
   - Global notification enable/disable.
   - Per-coupon notification enable/disable.
   - Reflect settings in expiry-check behavior (skip muted items/users).

4. Extraction reliability observability
   - Add simple dashboard/queryable log summary for extraction outcomes:
     - success
     - quota
     - network/provider error
     - partial QR-only success

## P2 — Quality and polish

5. UI polish pass
   - Final consistency sweep (spacing, copy, empty states, error messaging).
   - Ensure QR behavior is clearly explained in add/detail flows.

6. CI/CD hardening (deferred by design during MVP speed)
   - Re-enable stricter required checks before merge.
   - Add post-deploy smoke check for extraction endpoint.
   - Add branch protection policy once iteration cadence slows.

## Explicitly Post-MVP

- Web push notifications.
- Secondary provider fallback for full extraction (non-Gemini LLM path), only if still needed after quota behavior is acceptable.
- Structured logging.
- Basic monitoring dashboard.
- Error tracking.
- CloudWatch dashboards.
- Basic alarms.
- Adding an LLM abstraction layer (to easily switch between paid LLMs like Claude, OpenAI, or paid Gemini if necessary).
