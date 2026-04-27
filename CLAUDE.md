# Vaulty — Claude Briefing

Coupon and voucher manager. Android-first React Native app + web companion + serverless AWS backend.
Sole developer: Manuel Castellon. MVP in progress.

## Monorepo Structure

```
/
├── packages/
│   ├── backend/     # AWS Lambda (SAM) + API Gateway — TypeScript
│   ├── mobile/      # React Native (Expo, expo-router) — TypeScript
│   └── web/         # React + Vite — TypeScript
├── shared/          # Shared types (@coupon/shared) — consumed by all packages
└── CLAUDE.md
```

Package names: `@coupon/backend`, `@coupon/mobile`, `@coupon/web`, `@coupon/shared`

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native 0.74, Expo 51, expo-router |
| Web | React 18, Vite, react-router-dom |
| Backend | AWS Lambda (Node 24), API Gateway, AWS SAM |
| Database | DynamoDB — table `coupons-{stage}`, PK: `userId`, SK: `id` |
| Auth | AWS Cognito (email/password + Google SSO) |
| File Storage | AWS S3 (coupon images + QR crops) |
| AI — Primary | Gemini 2.5 Flash Lite — free tier only |
| AI — Fallback | QR-only/manual fallback paths (no paid AI) |
| CI/CD | GitHub Actions (active; deploy on `main`) |
| Deploy region | us-east-1 |

**Hard constraint: AI APIs must stay on free tiers. Never suggest paid AI usage.**

## Key Commands

```bash
# Root (run from project root)
npm run web              # Start web dev server
npm run mobile           # Start Expo dev server
npm run backend:dev      # Start SAM local API (requires env.json)
npm run backend:deploy   # Deploy to AWS (guided)

# Per-package (from packages/backend|mobile|web or shared)
npm run typecheck        # TypeScript check
npm run test             # Jest (backend only)
npm run build            # Build (web + backend)
```

## Data Model

Core type lives in `shared/src/types/coupon.ts`. Key fields:

- `userId` + `id` — DynamoDB composite key
- `discount: DiscountValue` — either `{ type: "percentage", value }` or `{ type: "fixed", value, currency }`
- `category: CouponCategory` — `food | retail | travel | entertainment | health | tech | other`
- `expiresAt` — ISO 8601, optional
- `usageCount` / `maxUsage` — count-based usage tracking
- `amountUsed` — monetary usage tracking for fixed-value coupons (e.g. $20 used of a $50 coupon)
- `imageUrl` — S3 URL of the coupon photo (set after upload via presigned URL)
- `qrCode` — QR code data or URL, extracted by AI
- `ttl` — DynamoDB TTL (auto-set on expired coupons)

All API types are in `shared/src/types/api.ts`. Always update shared types before touching backend or frontend.

## Architecture Decisions

- **Single DynamoDB table** — `userId` (HASH) + `id` (RANGE). Add GSIs if query patterns require it.
- **LLM Provider Abstraction** — The extraction pipeline follows a provider-agnostic interface (`LLMExtractionProvider`). `GeminiProvider` is the default; `BedrockClaudeProvider` is a code-only, safety-first backup. Adding new models requires zero changes to the core extraction logic.
- **Structured Observability** — All backend AI operations output JSON-structured logs to CloudWatch using a custom `log()` helper. Standardized fields include `event`, `outcome`, `provider`, `inputType`, and `durationMs` for real-time performance analytics.
- **SAM for infrastructure** — `packages/backend/template.yaml` is the source of truth for all AWS resources.
- **Shared types** — `@coupon/shared` is the contract between backend and frontends. Never duplicate type definitions.
- **Auth** — AWS Cognito. Client-side auth via `amazon-cognito-identity-js` in both web and mobile (`services/auth.ts`). Backend reads JWT from `Authorization` header; `event.requestContext.authorizer?.claims?.sub` is the userId. Env vars: `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` (web), `EXPO_PUBLIC_COGNITO_USER_POOL_ID` / `EXPO_PUBLIC_COGNITO_CLIENT_ID` (mobile). Values come from SAM Outputs after deploy.
- **Image/PDF uploads** — unified mobile support via `expo-document-picker`. Clients read files as base64 (with 4MB ceiling for API Gateway limits) and send `data` + `mimeType` to the `/extract` endpoint.
- **Platform parity** — web app and mobile app are interchangeable in features. Both support image/PDF uploads and AI extraction.
- **Sharing model** — claimed coupons are independent copies (no cross-user references). Sharer's `shareToken` is stored on the item; a sparse GSI (`shareToken-index`) enables public lookup without scanning the full table. Public endpoint uses `Auth: Authorizer: NONE` + `publicOk` helper (`Access-Control-Allow-Origin: *`).
- **Developer metrics** — SNS for real-time alerts (no SES sandbox friction), SES for the formatted HTML digest. No CloudWatch custom metrics ($0.30/metric/month); DynamoDB + Cognito are queried on-demand at digest time.

## MVP Scope (In)

- Coupon capture: photo, email paste, manual entry
- AI extraction of: store, discount, expiry, QR code, coupon code, description, conditions
- AI auto-categorization
- Expiry push notifications (3 days before, configurable)
- Natural language search (AI)
- Manual usage tracking (amount used from total)
- AWS Cognito auth (email/password)
- Cross-platform sync (Android + web)
- Coupon sharing via direct link (Phase 1 — copies, no image transfer)
- Developer metrics: SNS sign-up alerts + SES usage digest (Mon/Thu)

## Out of Scope (Post-MVP)

- Coupon sharing Phase 2: household/family shared library (only if data shows repeated sharing with same people)
- Claimed coupons inheriting the sharer's image (S3 cross-namespace copy)
- Universal deep links (vaulty:// → app) from web share preview
- Browser extension
- Retailer integrations or affiliate links
- Coupon recommendations/discovery

## Deployed Resources (dev)

- **API Gateway:** `https://l0tpj3eji8.execute-api.us-east-1.amazonaws.com/Prod` (stage is `Prod`, not `dev`)
- **Cognito User Pool:** `us-east-1_Ijluog7Z8`
- **Cognito Client:** `7i6d3i32b2ho56ts0fpt0fmcpq`
- **Cognito Domain:** `vaulty-dev-829808296740.auth.us-east-1.amazoncognito.com`
- **DynamoDB Table:** `coupons-dev`
- **S3 Bucket:** `vaulty-images-dev-829808296740`
- **CloudFormation Stack:** `coupon-manager` (us-east-1)

Env vars for local dev live in `packages/web/.env` (not committed). Use `VITE_API_URL=/api` + `VITE_API_TARGET=<ApiUrl>` — Vite proxies `/api` to avoid CORS.

SAM implicit API always deploys to stage `Prod` regardless of `Stage` parameter. The `Stage` parameter only affects resource names (e.g. DynamoDB table `coupons-dev`).

## MVP Status (as of 2026-04-23)

**Done:**
- Auth (email/password + Google SSO), coupon CRUD, amount tracking
- AI extraction (Gemini 2.5 Flash Lite) — photo/PDF/text → form auto-fill, mobile PDF via `expo-document-picker`
- AI natural language search — debounced, hides filters while active
- Expiry push notifications — EventBridge daily scan → Expo Push API, deep-links to coupon on tap
- Voucher support — itemType, faceValue/cost/eventDate/seatInfo fields
- Coupon sharing — direct link (Phase 1): share token GSI, public preview endpoint, claim creates independent copy, sharer notified on claim
- Developer metrics — SNS Cognito trigger (sign-up alerts) + SES scheduled digest (Mon/Thu 8AM UTC)
- LLM provider abstraction (`LLMExtractionProvider` interface), structured CloudWatch logging
- GitHub Actions CI/CD — typecheck + full test suite + SAM deploy on every main push
- Mobile auth parity — login, signup, confirm, Google SSO callback screens
- Cognito auth enforced at API Gateway level (DefaultAuthorizer)
- AWS infrastructure deployed end-to-end; Android APK distributed
- Account identity display — signed-in email + provider visible in web nav and mobile header (diagnostic for auth identity bug)

**Remaining / Post-MVP:**
- Web push notifications (post-MVP; mobile push fully implemented)
- Multi-store gift card type (post-MVP)
- Manual on-device smoke test after next EAS build (sharing + metrics + identity display are new)
- Cognito identity linking investigation (see Known bugs)

## Current Handoff (2026-04-23) — All pushed, deployed

Everything is committed and deployed. HEAD is `8f3316e`. CI passed on the last successful run.

**This session (2026-04-23):**
- Pushed sharing + metrics (built in the prior session, held for feedback) — 3 commits
- Fixed CloudFormation circular dependency: `CognitoUserPool` ↔ `SignUpNotificationFunction` via inherited `USER_POOL_ID` Global. Fixed by overriding to static `"none"` on `SignUpNotificationFunction`.
- Fixed `metrics-digest.ts` typecheck: `userMetrics` spread keys (`total`/`newInPeriod`) didn't match `DigestMetrics` shape (`totalUsers`/`newUsersInPeriod`).
- Updated README: system diagram, key decisions, observability section for sharing + metrics.
- Added `getCurrentUserInfo()` to both auth services; wired `userEmail` + `authProvider` into both `AuthContext`s; web nav and mobile header now show the signed-in email and "· Google" if Google SSO.
- Tracked identity-split bug (unconfirmed — likely wrong Google account selected; email display added to help users self-diagnose).

### ✅ Post-deploy tasks (2026-04-27)
1. **SNS subscription confirmation** — ✅ done; awaiting first digest receipt
2. **EAS build** — ✅ done; mobile build with share + `/shared/[token]` + identity display live
3. **Identity bug** — ✅ verified; user can't return to previous account (deprioritize; not critical for MVP)


## Cross-Platform Conventions

When fixing a bug or adding a feature on one platform (web or mobile), always:
1. Check if the same issue exists on the other platform and fix it there too
2. Add tests that cover the cross-platform behavior in the shared module or both platform modules
3. If a feature can't be translated (e.g., native push vs. browser push), explicitly note why and what the equivalent behavior is (or isn't)
4. Auth flows, API calls, and data display must behave consistently across platforms

**Shared utilities:**
- `packages/web/src/utils/date.ts` — `formatDate(iso)` → "10 Aug 2026" (use instead of `toLocaleDateString()`)
- `packages/mobile/utils/date.ts` — same as above for mobile
- `packages/mobile/utils/bidi.ts` — `isRTL(text)` for detecting Hebrew/Arabic text direction

## Known AI Limitations (Post-MVP Backlog)

### Store context problem (קומבינה-style)
AI cannot resolve brand→store relationships without internet search or a knowledge base (e.g., קומבינה coupon that's actually valid at בורגראנץ). Options for post-MVP:
1. Online search tool integration (must remain free-tier)
2. User-editable store field with autocomplete from past entries
3. Store alias / correction feedback mechanism

### Multi-store gift card (BuyMe, Bit, etc.)
Current `itemType: "coupon" | "voucher"` does not cleanly model multi-store gift cards. Post-MVP: add `itemType: "giftcard"` with fields:
- `cardNumber: string` — the full card number
- `cvv?: string` — security code (user feedback: CVV field requested as separate field, not in notes)
- `pin?: string` — PIN
- `balance?: number` — remaining balance
- `acceptedAt?: string[]` — list of store names (or IDs if a store DB is added)
- `acceptedAtUrl?: string` — link to issuer's official store locator for multi-store cards (BuyMe, Golden Token, etc.)

Do NOT repurpose `code` for card numbers.

**Store discovery (Phase 1, user feedback 2026-04-27):** Hardcode recognition for known Israeli multi-store cards (Dreams Card, Golden Token / תו הזהב, BuyMe / בייי מי) with links to their official store locators to reduce manual entry friction. Phase 2 (optional): crawl/sync store lists.

### Web/browser push notifications
Web push requires Web Push API + service workers + VAPID keys — significant complexity. Post-MVP. Mobile push is fully implemented.

### AI diligence statement
Write a formal disclosure covering: which AI systems were used, how AI contributed to the project, the review process employed, assertion of responsibility for the final output, and any context-specific considerations (academic, professional, etc.).

## Pre-Production Checklist (before public launch)

### Known bugs (active)
- **Cognito identity split on dual auth methods** *(unconfirmed — under investigation)*: At least one user reported signing in and seeing an empty account, as if a new user. The "account with this email already exists" guard fires correctly in most cases, so it may be a wrong-Google-account selection (phone auto-selects). To help replicate: both web and mobile now display the signed-in email + provider ("· Google") in the nav/header so users can confirm which account they're using. Root cause if real: Cognito treats email/password and Google OAuth as separate identities; fix would be a `PreSignUp` trigger calling `adminLinkProviderForUser`.

### Security gaps — acceptable for MVP, fix before public launch
- **Web tokens in localStorage**: `amazon-cognito-identity-js` and Google SSO `id_token` (`packages/web/src/services/auth.ts:123`) are stored in localStorage. Upgrading to httpOnly cookies requires a BFF (Backend for Frontend) architecture — significant rework. Low exploitability now (no XSS surface in React), but fix before scale.
- **No Content-Security-Policy header**: API Gateway doesn't send CSP headers. Add via CloudFront response headers policy.
- **S3 images are publicly readable by URL**: `presigned-url.ts` returns a public `https://bucket.s3.amazonaws.com/{key}` URL. The UUID makes URLs hard to guess (security-by-obscurity). Post-MVP: add CloudFront signed URL flow or S3 pre-signed GET URLs.
- **No per-user API rate limiting**: Lambda functions have no rate limiting beyond the AI extraction quota cooldown. Add WAF or API Gateway usage plans before public launch.

### AWS resource migration (preview → prod)
Every AWS resource is named by the `Stage` SAM parameter. Deploying with `Stage=prod` creates **entirely new, empty resources** — users lose all data unless migrated.

**Data migration steps:**
1. **DynamoDB**: export `coupons-dev` via S3 export → import into `coupons-prod`. Straightforward, no data loss.
2. **Cognito users**: use AWS bulk user import (CSV). **Passwords cannot be migrated** — users receive a "reset your password" email on first prod login. Unavoidable Cognito limitation.
3. **S3 images**: `aws s3 sync s3://vaulty-images-dev-829808296740 s3://vaulty-images-prod-{accountId}`. Also rewrite `imageUrl` fields in migrated DynamoDB records to point to prod bucket.
4. **Mobile app**: Cognito pool ID and client ID are baked into EAS builds. Switching Cognito pools requires a new EAS build + app update push.

**Before deploying prod stack:**
- Add production domain to `CallbackURLs` / `LogoutURLs` in `template.yaml` `CognitoUserPoolClient`
- Enable DynamoDB Point-in-Time Recovery (`PointInTimeRecoverySpecification: PointInTimeRecoveryEnabled: true` in `template.yaml`)
- Use a separate `GEMINI_API_KEY` for prod so preview/testing doesn't burn prod quota
- Set `WebAppUrl` SAM parameter to the production CloudFront/custom domain (not localhost)

**Custom domain for prod web:**
- Add a CNAME/alias in Route 53 → CloudFront distribution (`dxs2rcgjhblur.cloudfront.net`)
- Request an ACM certificate in us-east-1 (required for CloudFront)
- Add the domain as an alternate domain name on the CloudFront distribution

### EAS / app store (for public Android distribution)
- Current EAS profile is `preview` (internal APK). Switch to `production` profile for Google Play.
- Google Play requires a signed AAB (not APK), a store listing, screenshots, and privacy policy.
- Internal testing → closed track → open track is the standard rollout path.

## Conventions

- TypeScript everywhere — no `any`, no skipping type checks
- Validate at API boundaries; trust internal types
- Backend functions follow the pattern in `packages/backend/src/functions/coupons/`
- Return shapes use helpers from `packages/backend/src/lib/response.ts`
- No paid dependencies without discussion first
- **Tests are mandatory for every feature.** For every new Lambda handler or shared utility, either verify that tests exist or create them in the corresponding `__tests__/` directory before marking the work done. Follow the pattern in `packages/backend/src/functions/coupons/__tests__/list.test.js`: `jest.mock("@aws-sdk/lib-dynamodb", ...)`, `jest.mock("../../../lib/dynamodb", ...)`, CommonJS `require` of the `.ts` handler. Tests for all new and changed handlers must pass before deploy.
