# Vaulty 🎫

> A full-stack, AI-powered coupon and voucher manager.

[![Live Demo](https://img.shields.io/badge/Live_Web_App-Available-success?style=flat-square)](https://dxs2rcgjhblur.cloudfront.net/)
[![Download APK](https://img.shields.io/badge/Android_APK-Latest-orange?style=flat-square&logo=android)](https://github.com/Manuel-Castellon/Vaulty/releases/latest)
![React Native](https://img.shields.io/badge/React_Native-0.74-blue?style=flat-square)
![React](https://img.shields.io/badge/React-18-blue?style=flat-square)
![AWS Serverless](https://img.shields.io/badge/AWS-Serverless-orange?style=flat-square)
![Gemini AI](https://img.shields.io/badge/AI-Gemini_2.5-purple?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square)

Vaulty is a modern, cross-platform application that helps users digitize, track, and utilize their coupons and vouchers. Built with a serverless architecture, it leverages AI to automatically extract key details from photos of physical receipts, streamlining the storage and retrieval process.

## 📸 See it in Action

Vaulty seamlessly captures and manages receipts. Using integrated artificial intelligence, you simply snap a photo—Vaulty automatically populates the store, discount amount, expiration dates, and QR code logic directly into the cross-platform application.

https://github.com/user-attachments/assets/cf6eb0b8-d958-49b1-befa-c3a98394de4a

*If the inline video does not play, [click here to view the demo](https://github.com/Manuel-Castellon/Vaulty/blob/main/docs/demo/Vaulty_Demo.mp4).*

## 📲 Try it Out

Vaulty is fully functional across both web and mobile. Use the links below to test the AI extraction and cross-platform sync.

| Platform | Link | Status |
| :--- | :--- | :--- |
| **🌐 Web App** | [Try Vaulty in the Browser](https://dxs2rcgjhblur.cloudfront.net/) | Live Deployment |
| **📱 Android** | [Download Latest APK](https://github.com/Manuel-Castellon/Vaulty/releases/latest) | v1.0.0 (MVP) |

### 🛠️ Android Installation Notes
1. **Download**: Grab the latest `.apk` from the [Releases](https://github.com/Manuel-Castellon/Vaulty/releases) page.
2. **Permissions**: You may need to "Allow installation from unknown sources" in your Android settings to install the build.
3. **Login**: Use the same credentials across both platforms to see real-time sync in action.



## 🏗️ Technical Architecture

Vaulty handles complex state across web and mobile via a unified, serverless backend.

### System Overview
```mermaid
graph TB
    subgraph "Clients"
        Mobile["📱 React Native (Expo)"]
        Web["💻 React (Vite)"]
        PublicWeb["🌐 Public Share Preview"]
    end

    subgraph "Web Hosting"
        CF["☁️ CloudFront + private S3 (OAC)"]
    end

    subgraph "AWS Cloud"
        APIGW["⚡ API Gateway (Cognito default authorizer)"]
        subgraph "Lambda Functions"
            CRUD["Coupon CRUD (Create/List/Get/Update/Delete)"]
            Upload["Presigned Upload URL"]
            Extract["AI Extract + QR Detection"]
            Search["AI Natural-Language Search"]
            Prefs["Push Token + Notification Prefs"]
            Notif["Expiry Check (Scheduled)"]
            Share["Sharing (Share/Preview/Claim)"]
            Metrics["Metrics (SignUp Alert + Digest)"]
        end
        DDB[("DynamoDB - coupons table\n+ shareToken-index GSI")]
        S3["🪣 S3 - Coupon Images and QR Crops"]
        EB["⏰ EventBridge (Daily + Mon/Thu)"]
        SNS["📣 SNS - Sign-up Alerts"]
        SES["✉️ SES - Metrics Digest"]
        Cognito["🔐 Cognito User Pool"]
    end

    subgraph "External"
        Gemini["🧠 Gemini 2.5 Flash Lite"]
        Expo["📬 Expo Push API"]
        Dev["👤 Developer Email"]
    end

    CF --> Web & PublicWeb
    Mobile & Web --> APIGW
    PublicWeb -->|"unauthenticated share preview"| APIGW
    APIGW --> CRUD & Upload & Extract & Search & Prefs & Share
    Cognito -->|"PostConfirmation trigger"| Metrics
    CRUD --> DDB
    Prefs --> DDB
    Share --> DDB
    Upload --> S3
    Extract --> Gemini
    Extract --> S3
    Search --> Gemini
    Search --> DDB
    EB --> Notif & Metrics
    Notif --> DDB
    Notif --> Expo
    Share --> Expo
    Metrics --> DDB & Cognito
    Metrics --> SNS & SES
    SNS & SES --> Dev
```

The backend stack (`packages/backend/template.yaml`) and the web hosting stack (`packages/web/infra/hosting.yaml`) are two separate CloudFormation stacks. The web bundle is served from a private S3 bucket fronted by CloudFront via Origin Access Control; the SPA talks to API Gateway directly.

### API Surface

Every route is authenticated by the API Gateway Cognito default authorizer except the public share preview, which overrides it with `Authorizer: NONE`. Handlers read the caller from `event.requestContext.authorizer.claims.sub`.

Cognito backs two sign-in paths: email/password, and Google via a `UserPoolIdentityProvider` and the Cognito hosted-UI domain running the OAuth code flow. Both clients implement the redirect callback (`packages/web/src/pages/AuthCallbackPage.tsx`, `packages/mobile/app/auth/callback.tsx`).

| Method | Path | Lambda | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/coupons` | `list` | List the caller's items |
| `POST` | `/coupons` | `create` | Create an item |
| `GET` | `/coupons/{id}` | `get` | Fetch one item |
| `PUT` | `/coupons/{id}` | `update` | Update an item (incl. usage tracking) |
| `DELETE` | `/coupons/{id}` | `delete` | Delete an item |
| `POST` | `/extract` | `extract` | AI extraction from image, PDF, or text |
| `POST` | `/search` | `search` | Natural-language search over the caller's items |
| `GET` | `/upload-url` | `presigned-url` | Presigned S3 PUT URL for a coupon image |
| `POST` | `/push-token` | `register-token` | Register an Expo push token |
| `GET` `PUT` | `/notifications/preferences` | `preferences` | Read/write expiry-alert preferences |
| `POST` `DELETE` | `/coupons/{id}/share` | `share` | Mint or revoke a share token |
| `GET` | `/shared/{shareToken}` | `shared-preview` | **Public**: preview a shared item |
| `POST` | `/coupons/claim/{shareToken}` | `claim` | Claim a shared item as an independent copy |

Three functions are not fronted by API Gateway: `expiry-check` (EventBridge, `rate(1 day)`), `metrics-digest` (EventBridge, `cron(0 8 ? * MON,THU *)`), and `signup-notification` (Cognito PostConfirmation trigger).

### Single-Table Layout

One DynamoDB table (`coupons-{stage}`) holds everything, keyed by `userId` (HASH) + `id` (RANGE). Coupons use a UUID as the sort key; per-user settings reuse the same partition with reserved sort keys (`PUSH_TOKEN` and `NOTIFICATION_PREFS`), so a user's data is one partition and needs no second table. The scheduled expiry scan filters those reserved ids out explicitly. TTL is enabled on a `ttl` attribute at the table level, but no handler currently writes it.

### LLM Provider Abstraction
The extraction pipeline is built on a provider-agnostic interface (`LLMExtractionProvider`), enabling switching between AI models without modifying core handler logic. `createProvider()` picks the implementation from environment configuration at invocation time.

```mermaid
graph TD
    Handler["Extract Handler (POST /extract)"] --> |"LLMExtractionProvider"| Provider["createProvider()"]
    Provider --> Gemini["GeminiProvider: Gemini 2.5 Flash Lite (default)"]
    Provider --> Bedrock["BedrockClaudeProvider (BEDROCK_ENABLED=true)"]
    Handler --> QR["QR Extraction (jsQR decode + jimp crop → S3)"]
```

For image uploads, the LLM call and QR detection run concurrently via `Promise.allSettled`. If jsQR decodes a value the model missed, it fills in the `code` field; if the provider hits its quota but QR detection succeeded, the request still returns the QR result with a `quota_exhausted` warning instead of failing outright.

The `/search` handler calls Gemini directly rather than through this interface; it is a separate, simpler path with no file or QR handling. It queries up to 200 of the caller's items and asks the model to return matching ids in rank order, so it is LLM-ranked retrieval over data already fetched, not vector search. The 200-item cap is a hard ceiling on what search can see.

### CI/CD Pipeline
Four GitHub Actions workflows cover the monorepo. Coverage is uneven by design and worth stating plainly: the backend deploy is gated on the full backend and shared suites, while the web deploy is gated on typecheck and build only.

```mermaid
graph LR
    subgraph "deploy.yml: every push and PR"
        TC["Test: shared + backend, one web test file\nTypecheck: all four workspaces"]
        Deploy["SAM build + deploy → AWS (push to main only)"]
    end

    subgraph "web.yml: push to main, or manual dispatch"
        WebTC["Test shared, typecheck web, build"]
        WebDeploy["S3 sync → CloudFront invalidation"]
    end

    subgraph "mobile.yml: push, PR, or manual"
        MobTC["Typecheck + Jest (mobile)"]
        Bundle["Prebuild + expo export (Metro/codegen check)"]
        EAS["EAS Android preview build (manual dispatch only)"]
    end

    subgraph "backend.yml: push and PR (backend/shared paths)"
        BeTC["Typecheck + Jest (backend)"]
    end

    TC --> Deploy
    WebTC --> WebDeploy
    MobTC --> Bundle --> EAS
```

All jobs run on Node 24, matching the `nodejs24.x` Lambda runtime.

Two gaps to be aware of before relying on CI as a safety net: `deploy.yml` runs only a typecheck for mobile (the mobile Jest suite lives in `mobile.yml`) and only the `AddCouponPage` test file for web, and `web.yml` never runs the web Vitest suite at all before syncing to S3. `web.yml` also accepts `workflow_dispatch` with no branch guard, so it can publish a non-`main` build.

## 🚀 Key Engineering Decisions

- **LLM Provider Abstraction:** A provider-agnostic interface that swaps AI backends (Gemini, Bedrock Claude) without altering handler logic or QR orchestration. The abstraction is real but not yet at parity: `BedrockClaudeProvider` discards the prompt the handler passes and uses its own, so the shared extraction prompt's rules do not apply under Bedrock, and its PDF path shells out to `pdftoppm`, which is not present in the Lambda image and has no layer configured. Gemini is the only provider currently exercised end to end.
- **Structured Observability:** The extraction pipeline emits JSON-structured CloudWatch events through a shared `log()` helper, tracking outcome, provider, input type, and duration for queryable insights. Other handlers use plain `console` logging.
- **Multi-Format Extraction:** A unified pipeline accepting images, PDFs, and raw text across both platforms, with source-language and script preservation enforced by a validation-and-retry pass on the model output. `/extract` treats JPEG, PNG, WebP, and GIF as images for QR detection; `/upload-url` presigns only JPEG, PNG, and WebP.
- **Graceful Degradation:** Quota management that falls back to QR-only extraction and manual-entry paths when the provider rate-limits, keyed per user and per input hash. The cooldown is a module-level in-memory `Map`, so it is scoped to one Lambda execution environment: it suppresses repeat submissions that land on a warm container, not across the fleet.
- **Full-Stack Type Safety:** A unified NPM Workspaces monorepo where the `@coupon/shared` library enforces strict TypeScript contracts between the AI backend and all clients.
- **Serverless Scale & IaC:** Infrastructure-as-Code (AWS SAM / CloudFormation) ensuring a reproducible, horizontally scalable stack with zero idle cost.
- **Event-Driven Lifecycle:** A daily EventBridge schedule scans DynamoDB for upcoming expirations and sends proactive alerts via the Expo Push API, honouring each user's stored notification preferences (on/off, days-before-expiry).
- **Coupon Sharing:** A sparse DynamoDB GSI on `shareToken` enables unauthenticated public preview lookups without full-table scans. Claimed coupons are independent copies—no cross-user references—keeping the data model simple at Phase 1 scale.
- **Developer Metrics:** Zero-cost operational visibility via Cognito PostConfirmation → SNS (real-time sign-up alerts) and a twice-weekly EventBridge → SES HTML digest covering user and coupon growth. No CloudWatch custom metrics ($0.30/metric/month).

## ⚖️ Tradeoffs & Limitations

- **Cold Start Latency:** Using AWS Lambda for the backend ensures zero idle cost but introduces occasional sub-second cold starts. This was accepted in favor of cost-efficiency for a B2C application with variable traffic.
- **DynamoDB Access Patterns:** The schema is optimized for the dominant path, list-by-user, via a `Query` on the `userId` partition key. Share-link lookups go through the sparse `shareToken-index` GSI. The two scheduled jobs (expiry check, metrics digest) use full-table `Scan`s, which is acceptable at current scale but is the first thing that would need reworking as the table grows.
- **Cost Control:** 
    - **LLM as Primary Driver:** AI extraction is the dominant cost. The architecture includes a "Fallback Mode" and quota-limiting logic to protect against bot-driven cost spikes.
    - **Serverless Efficiency:** Lambda and DynamoDB (On-Demand) were chosen specifically to maintain a "Free Tier" friendly profile while handling bursty mobile usage.
- **Gemini Quota Constraints:** Using the Flash Lite tier provides high speed and low cost, but includes rate limits. The system handles these gracefully by falling back to QR-only or manual entry paths.
- **Throughput Assumptions:** The current architecture prioritizes per-request responsiveness over massive batch processing, fitting the "snap-and-save" mobile user flow.

## 📊 Observability & Insights

Vaulty has two tiers of observability: structured logs for the AI extraction path, and a lightweight developer metrics pipeline for business-level tracking.

### Structured CloudWatch Logs

The extraction handler emits JSON-structured events (`extract.started`, `extract.completed`, `extract.failed`, `extract.language_validation_failed`, `extract.quota_cooldown_short_circuit`) queryable via CloudWatch Insights:

**Example: Extraction outcomes and latency by provider (last 24h)**
```sql
fields @timestamp, event, outcome, provider, durationMs
| filter event = "extract.completed" or event = "extract.failed"
| stats count() as calls, avg(durationMs) as avgMs by outcome, provider
| sort calls desc
```

`outcome` is one of `success`, `quota`, `network`, `provider_error`, `parse_error`, or `unknown`, so this breakdown doubles as the success-rate view.

### Developer Metrics Pipeline

Two lightweight mechanisms surface business-level data without CloudWatch custom metric costs:

- **Sign-up Alerts:** Cognito PostConfirmation → SNS → email. Fires within seconds of each verified registration.
- **Twice-weekly Digest:** EventBridge (Mon + Thu 8AM UTC) → Lambda → SES HTML email. Reports total users, new users, total coupons, and breakdowns by category, status, and item type—all queried live from DynamoDB and Cognito at send time.

## 🛠️ Local Setup 

This is an NPM Workspaces monorepo (`packages/backend`, `packages/mobile`, `packages/web`, `shared`). Node 20+ is the declared minimum; CI and the Lambda runtime both use Node 24.

```bash
# 1. Install workspace dependencies
npm install --legacy-peer-deps

# 2. Run the platform of your choice:
npm run web           # Start the Vite React web server
npm run mobile        # Start the Expo React Native server

# Backend development (requires AWS SAM CLI and packages/backend/env.json)
npm run backend:dev   # Start SAM local API
npm run backend:deploy

# 3. Per-workspace checks
npm run typecheck --workspace=packages/backend   # or packages/web | packages/mobile | shared
npm run test --workspace=packages/backend        # Jest; web uses Vitest, shared uses node:test
```

## 📚 Project Deep Dive

Check out the [CLAUDE.md](./CLAUDE.md) file for a granular breakdown of the MVP status, data models, infrastructure, and CI/CD operations.
