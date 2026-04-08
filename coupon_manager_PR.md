**Product Requirements Document**

*Coupon and Voucher Manager — Android & Web App*

MVP Version 1.0

| Field | Details |
| :---- | :---- |
| Document Owner | Manuel Castellon |
| Last Updated | April 8, 2026 |
| Status | Draft |
| Target Platforms | Android App \+ Web App |
| Cloud Infrastructure | AWS |
| Repository | https://github.com/Manuel-Castellon/Vaulty |

# **1\. Overview**

This document defines the requirements for the MVP of a coupon management app, available on Android and as a web application. The app helps users capture, organize, track, and retrieve their coupons — with AI assistance for extraction and smart search.

# **2\. Goals & Success Metrics**

## **2.1 Goals**

* Allow users to capture coupons from photos, emails, or manual entry

* Automatically extract key coupon details using AI

* Alert users before coupons expire

* Provide fast, natural-language search across saved coupons

## **2.2 Success Metrics (MVP)**

| Metric | Target |
| :---- | :---- |
| Coupon capture time (photo to saved) | \< 10 seconds |
| AI extraction accuracy | \> 85% |
| User retention (7-day) | No target, MVP |
| Crash-free sessions | \> 99% |

# **3\. Target Users**

* Primary: Deal-conscious individuals who regularly use coupons and vouchers for groceries, retail, restaurants, and don’t have a good way of knowing which coupons they used, didn’t use, and how much of each coupon they used.

* Secondary: Households managing shared coupon wallets

# **4\. MVP Scope**

## **4.1 In Scope**

| Feature | Description | AI-Powered? |
| :---- | :---- | :---- |
| Coupon Capture | Photo, email, or manual entry | Yes — extraction |
| Auto-extraction | Parse store, discount, expiry from image/text | Yes |
| Coupon Storage | Save and retrieve coupons | No |
| Categories | Auto-categorize by store type | Yes |
| Expiry Alerts | Push notifications before expiry | No |
| Smart Search | Natural language query across coupons | Yes |
| User Accounts | Sign up, login, basic profile | No |
| Cross-platform Sync | Android and web stay in sync | No |
| Regular search | Filter and arrange | No |
| Manually change amount | For tracking progress in coupons that have money amount that can be used over time | No |

## **4.2 Out of Scope (Post-MVP)**

* Coupon sharing between users

* Browser extension for auto-capturing online codes

* Retailer integrations or affiliate links

* Coupon recommendations / discovery

# **5\. Functional Requirements**

## **5.1 Coupon Capture & Extraction**

* User can photograph a physical coupon; AI extracts store or service name, discount amount, money amount, expiry date, QR code, coupon code, description, and any conditions

* User can forward/paste an email coupon; AI extracts same fields

* User can manually enter coupon details as a fallback or from the get go

* Extracted fields are editable before saving

## **5.2 Coupon Management**

* User can view all coupons in a list or grid view

* User can filter by category, store, or expiry date

* User can archive or delete a coupon, or say it’s used up or how used up it is (amount from amount)

* Expired coupons are visually distinguished

## **5.3 Notifications**

* User receives a push notification 3 days before a coupon expires (configurable)

* User can enable/disable notifications per coupon or globally

## **5.4 Search**

* User can type a natural language query (e.g. 'any coffee discounts this week?')

* AI interprets query and returns relevant coupons

## **5.5 Authentication**

* Email/password sign-up and login via AWS Cognito

* Password reset flow

* Session persistence on both platforms

# **6\. Non-Functional Requirements**

| Requirement | Target |
| :---- | :---- |
| API response time (p95) | \< 500ms (non-AI calls) |
| AI extraction response time | \< 10 seconds |
| Uptime | \> 99.5% |
| Data storage | AWS S3 (images), DynamoDB or RDS (data) |
| Authentication | AWS Cognito |
| Security | HTTPS only, JWT tokens, encrypted storage |
| Platform support | Android 10+, modern browsers (Chrome, Safari, Firefox) |

# **7\. Technical Architecture (Proposed)**

| Layer | Technology | Notes |
| :---- | :---- | :---- |
| Android App | \[ Kotlin / React Native \] | To be confirmed |
| Web App | \[ React / Vue \] | To be confirmed |
| API | AWS Lambda \+ API Gateway | REST API, serverless |
| Database | DynamoDB or RDS (PostgreSQL) | TBD based on query needs |
| File Storage | AWS S3 | Coupon images |
| Auth | AWS Cognito | User management |
| AI / Extraction | Free API only – such as Llama Vision or Gemini Flash Lite | Image & text parsing |
| AI / Search | Free API only | Natural language queries |
| CI/CD | GitHub Actions | Deploy on push to main |
| Repository | GitHub | Monorepo or split repos |

# **8\. AI Delegation Plan**

The following framework guides which tasks are delegated to AI vs. handled by conventional code:

| Task | Approach | Rationale |
| :---- | :---- | :---- |
| Extract coupon details from image | AI (Free Grok / Gemini) | Unstructured input, interpretive |
| Extract coupon details from email text | AI (Free Grok / Gemini) | Unstructured input, interpretive |
| Auto-categorize coupon | AI (Free Grok / Gemini) | Fuzzy classification |
| Natural language search | AI (Free Grok / Gemini) | Interpretive, open-ended |
| Store / retrieve coupon data | Conventional code | Deterministic, reliability critical |
| User authentication | Conventional code (Cognito) | Security-critical, deterministic |
| Expiry notification scheduling | Conventional code | Time-based, must be reliable |
| UI rendering | Conventional code | Deterministic, performance-sensitive |

# **9\. Open Questions**

| \# | Question | Owner | Due |
| :---- | :---- | :---- | :---- |
| 1 | Native Android or cross-platform (React Native)? | Manuel | \[ Date \] |
| 2 | Monorepo or separate frontend/backend repos? | Manuel | \[ Date \] |
| 3 | DynamoDB vs RDS — query complexity TBD | Manuel | \[ Date \] |
| 4 | Free tier / pricing model for MVP? | Manuel | \[ Date \] |
| 5 | Will the app support multiple languages? | Manuel | \[ Date \] |

# **10\. Rough Milestones**

| Stage | Description | Est. Duration |
| :---- | :---- | :---- |
| 1 — Define & Design | Finalize PRD, data model, wireframes | 1–2 weeks |
| 2 — Infrastructure | Git repo, AWS setup, CI/CD | 1 week |
| 3 — Backend | Core API, auth, database, notifications | 2–3 weeks |
| 4 — AI Integration | Extraction, categorization, search | 1–2 weeks |
| 5 — Frontend | Android app \+ web app | 3–4 weeks |
| 6 — Test & Harden | QA, edge cases, user testing | 1–2 weeks |
| 7 — MVP Launch | Limited release | — |

*This document is a living template. Update it as decisions are made and requirements evolve*

