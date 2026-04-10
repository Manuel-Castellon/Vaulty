#!/usr/bin/env bash
set -e

ENV_FILE="$(dirname "$0")/../.env.production"

echo "==> Checking .env.production..."
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.production not found"
  exit 1
fi

REQUIRED_VARS=(
  VITE_API_URL
  VITE_COGNITO_USER_POOL_ID
  VITE_COGNITO_CLIENT_ID
  VITE_COGNITO_DOMAIN
)

for var in "${REQUIRED_VARS[@]}"; do
  value=$(grep "^${var}=" "$ENV_FILE" | cut -d= -f2-)
  if [ -z "$value" ]; then
    echo "ERROR: $var is missing or empty in .env.production"
    exit 1
  fi
done

# Guard against accidentally deploying with the dev proxy URL
API_URL=$(grep "^VITE_API_URL=" "$ENV_FILE" | cut -d= -f2-)
if [[ "$API_URL" == "/api" ]]; then
  echo "ERROR: VITE_API_URL is '/api' (the dev proxy) — set it to the real API Gateway URL in .env.production"
  exit 1
fi

echo "    API URL: $API_URL"
echo "    All required vars present."

echo "==> Type-checking..."
npm run typecheck

echo "==> Building..."
npm run build

echo "==> All checks passed. Safe to deploy."
