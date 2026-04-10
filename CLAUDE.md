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
| Backend | AWS Lambda (Node 18), API Gateway, AWS SAM |
| Database | DynamoDB — table `coupons-{stage}`, PK: `userId`, SK: `id` |
| Auth | AWS Cognito (planned, not yet scaffolded) |
| File Storage | AWS S3 (planned, for coupon images) |
| AI — Primary | Grok (Llama) — free tier only |
| AI — Fallback | Gemini Flash Lite — free tier only |
| CI/CD | GitHub Actions (planned) |
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
- **AI provider abstraction** — Grok (Llama) is primary, Gemini Flash Lite is fallback. Keep providers behind an interface so switching is clean.
- **SAM for infrastructure** — `packages/backend/template.yaml` is the source of truth for all AWS resources.
- **Shared types** — `@coupon/shared` is the contract between backend and frontends. Never duplicate type definitions.
- **Auth** — AWS Cognito. Client-side auth via `amazon-cognito-identity-js` in both web and mobile (`services/auth.ts`). Backend reads JWT from `Authorization` header; `event.requestContext.authorizer?.claims?.sub` is the userId. Env vars: `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` (web), `EXPO_PUBLIC_COGNITO_USER_POOL_ID` / `EXPO_PUBLIC_COGNITO_CLIENT_ID` (mobile). Values come from SAM Outputs after deploy.
- **Image uploads** — presigned S3 URL flow: client calls `GET /upload-url`, uploads directly to S3, then saves the returned `imageUrl` on the coupon.
- **Platform parity** — web app and mobile app are interchangeable in features. Web-first during development; migrate to mobile as features stabilise.

## MVP Scope (In)

- Coupon capture: photo, email paste, manual entry
- AI extraction of: store, discount, expiry, QR code, coupon code, description, conditions
- AI auto-categorization
- Expiry push notifications (3 days before, configurable)
- Natural language search (AI)
- Manual usage tracking (amount used from total)
- AWS Cognito auth (email/password)
- Cross-platform sync (Android + web)

## Out of Scope (Post-MVP)

- Coupon sharing between users
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

## MVP Status (as of 2026-04-09)

**Done:**
- Auth (email/password + Google SSO), coupon CRUD, amount tracking
- AI extraction (Gemini 2.5 Flash Lite) — photo/PDF/text → form auto-fill
- AI natural language search — debounced, hides filters while active
- Expiry push notifications — EventBridge daily scan → Expo Push API, deep-links to coupon on tap
- Voucher support — itemType, faceValue/cost/eventDate/seatInfo fields
- GitHub Actions CI/CD — typecheck + SAM deploy on every main push
- Mobile auth parity — login, signup, confirm, Google SSO callback screens fully implemented
- Cognito auth enforced at API Gateway level (DefaultAuthorizer)
- AWS infrastructure deployed end-to-end

**Remaining:**
- EAS / Android cloud build (needs EXPO_TOKEN + EAS account setup)
- UI polish pass
- Web push notifications (post-MVP)

## Current Handoff (2026-04-09)

- Working tree is intentionally dirty with active MVP changes across backend, mobile, web, and shared. Do not reset or discard anything without Manuel's explicit instruction.
- AI extraction currently uses Gemini 2.5 Flash Lite only. Quota exhaustion returns a manual-entry fallback message; alternative free-tier fallback providers are tracked in `fallback_ai_backlog.md`.
- Extraction hardens language preservation for Hebrew/non-Latin documents in `packages/backend/src/functions/ai/extract.ts`.
- Live extraction smoke coverage exists in `packages/backend/src/functions/ai/__tests__/extract.live.test.js` and currently targets `examples/dominos.pdf` and `examples/castro.pdf`.
- Shared merge behavior in `shared/src/lib/extractionMerge.ts` intentionally preserves user-entered form values; extracted values only fill blank/default fields.
- Mobile manual verification focus after the latest extraction work is in `mobile_smoke_checklist.md`.
- Next model-assisted manual task: verify golden examples for PDF/image scanning, starting with the fixtures and acceptance criteria in `NEXT_MODEL_HANDOFF.md`.

## Conventions

- TypeScript everywhere — no `any`, no skipping type checks
- Validate at API boundaries; trust internal types
- Backend functions follow the pattern in `packages/backend/src/functions/coupons/`
- Return shapes use helpers from `packages/backend/src/lib/response.ts`
- No paid dependencies without discussion first
