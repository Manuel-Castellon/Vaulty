# Vaulty 🎫

> A full-stack, AI-powered coupon and voucher manager.

[![Live Demo](https://img.shields.io/badge/Live_Web_App-Available-success?style=flat-square)](https://dxs2rcgjhblur.cloudfront.net/)
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

**🌐 [Try the Live Web App Here!](https://dxs2rcgjhblur.cloudfront.net/)**

## 🏗️ Technical Architecture

Vaulty handles complex state across web and mobile via a unified, serverless backend.

### System Overview
```mermaid
graph TB
    subgraph "Clients"
        Mobile["📱 React Native (Expo)"]
        Web["💻 React (Vite)"]
    end

    subgraph "AWS Cloud"
        APIGW["⚡ API Gateway + Cognito Auth"]
        subgraph "Lambda Functions"
            CRUD["CRUD (List/Get/Update/Delete)"]
            Extract["AI Extract & QR Detection"]
            Search["Semantic AI Search"]
            Notif["Expiry Check (Scheduled)"]
        end
        DDB[("DynamoDB - App Data")]
        S3["🪣 S3 - Metadata & QR Crops"]
        EB["⏰ EventBridge (Daily Sweeps)"]
    end

    subgraph "External"
        Gemini["🧠 Gemini 2.5 Flash Lite"]
        Expo["📬 Expo Push API"]
    end

    Mobile & Web --> APIGW
    APIGW --> CRUD & Extract & Search
    CRUD --> DDB
    Extract --> Gemini
    Extract --> S3
    Search --> Gemini
    Search --> DDB
    EB --> Notif
    Notif --> DDB
    Notif --> Expo
```

### LLM Provider Abstraction
The extraction pipeline is built on a provider-agnostic interface, enabling seamless switching between different AI models without modifying core handler logic.

```mermaid
graph TD
    Handler["Extract Handler"] --> |"Provider Interface"| Provider
    Provider --> Gemini["Gemini 2.5 Flash (default)"]
    Provider --> Bedrock["Bedrock Claude (optional toggle)"]
    Provider -.-> Future["OpenAI / DeepSeek (pluggable)"]
    Handler --> QR["QR Extraction (jsQR)"]
```

### CI/CD Pipeline
Continuous integration ensures code quality and automated delivery to both AWS infrastructure and mobile targets.

```mermaid
graph LR
    subgraph "On Push"
        TC["TypeScript Core & Unit Tests"]
    end

    subgraph "On Merge to Main"
        Deploy["SAM Deploy → AWS Cloud"]
        WebDeploy["Build → S3 → CloudFront"]
    end

    subgraph "Manual Trigger"
        EAS["EAS Build → Android APK"]
    end

    TC --> Deploy
    TC --> WebDeploy
    TC --> EAS
```

## 🚀 Key Engineering Decisions

- **LLM Provider Abstraction:** A provider-agnostic interface that enables hot-swappable AI backends (Gemini, Bedrock, etc.) without altering handler logic or QR orchestration.
- **Structured Observability:** Real-time JSON-structured logging via CloudWatch, tracking extraction outcomes, provider performance, and latency dimensions for queryable insights.
- **Multi-Format Extraction:** A unified pipeline accepting images (JPEG, PNG, WebP), PDFs, and raw text across all platforms with native language script preservation.
- **Graceful Degradation:** Intelligent quota management that triggers QR-only extraction and manual-entry paths during periods of high demand, ensuring a resilient user experience.
- **Full-Stack Type Safety:** A unified NPM Workspaces monorepo where the `@coupon/shared` library enforces strict TypeScript contracts between the AI backend and all clients.
- **Serverless Scale & IaC:** Infrastructure-as-Code (AWS SAM / CloudFormation) ensuring a reproducible, infinitely scalable stack with zero idle cost.
- **Event-Driven Lifecycle:** Daily EventBridge schedules for DynamoDB TTL sweeps, providing proactive expiration alerts via the Expo Push API.

## ⚖️ Tradeoffs & Limitations

- **Cold Start Latency:** Using AWS Lambda for the backend ensures zero idle cost but introduces occasional sub-second cold starts. This was accepted in favor of cost-efficiency for a B2C application with variable traffic.
- **DynamoDB Access Patterns:** The schema is optimized for lookup-by-user and expiry sweeps. While less flexible than SQL for complex joins, it offers consistent single-digit millisecond performance at scale.
- **Cost Control:** 
    - **LLM as Primary Driver:** AI extraction is the dominant cost. The architecture includes a "Fallback Mode" and quota-limiting logic to protect against bot-driven cost spikes.
    - **Serverless Efficiency:** Lambda and DynamoDB (On-Demand) were chosen specifically to maintain a "Free Tier" friendly profile while handling bursty mobile usage.
- **Gemini Quota Constraints:** Using the Flash Lite tier provides high speed and low cost, but includes rate limits. The system handles these gracefully by falling back to QR-only or manual entry paths.
- **Throughput Assumptions:** The current architecture prioritizes per-request responsiveness over massive batch processing, fitting the "snap-and-save" mobile user flow.

## 📊 Observability & Insights

Vaulty uses structured JSON logging in CloudWatch, allowing recruiters or engineers to run aggregate queries on system performance:

**Example: Extraction Success Rate (Last 24h)**
```sql
fields @timestamp, event, outcome, provider, durationMs
| filter event = "extract.completed" or event = "extract.failed"
| stats count() as total, count_distinct(outcome) by outcome
| sort total desc
```

## 🛠️ Local Setup 

To explore this workspace locally, ensure you have Node.js (v20+) installed.

```bash
# 1. Install workspace dependencies
npm install

# 2. Run the platform of your choice:
npm run web           # Start the Vite React web server
npm run mobile        # Start the Expo React Native server

# Backend Development (Requires AWS SAM & env.json)
npm run backend:dev   # Start SAM local API 
```

## 📚 Project Deep Dive

Check out the [CLAUDE.md](./CLAUDE.md) file for a granular breakdown of the MVP status, data models, infrastructure, and CI/CD operations.
