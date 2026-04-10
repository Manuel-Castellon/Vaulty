# MVP Gap Checklist (Prioritized)

Updated: 2026-04-10

## P0 — Launch blockers

1. Android APK / installable build
   - Set up EAS (`eas.json`, project linkage, `EXPO_TOKEN` in CI/secrets).
   - Produce internal test APK/AAB and verify install path end-to-end.

2. Password reset flow
   - Implement forgot/reset password screens and API wiring on web + mobile.
   - Validate Cognito reset flow and error states.

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
