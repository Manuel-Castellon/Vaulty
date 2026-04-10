# Android EAS Build Runbook

## Local first build (manual)

Run from `packages/mobile`:

```bash
npm run preflight:android
eas whoami
eas build --platform android --profile preview
```

`preflight:android` is the required green gate before cloud build. If it fails, fix locally first and do not queue EAS yet.

If you use Google login for Expo, prefer token auth:

```bash
export EXPO_TOKEN=your_token_here
eas whoami
```

## CI build trigger

The mobile workflow includes a gated cloud build job:

- Runs only on manual `workflow_dispatch` (never auto on push)
- Runs only when repository secret `EXPO_TOKEN` exists
- Runs local preflight in CI before queueing EAS build
- Uses `preview` profile from `eas.json` (APK internal distribution)

## Required GitHub secret

Set repository secret:

- `EXPO_TOKEN`: personal access token from Expo account settings

Create token at:

- `https://expo.dev/settings/access-tokens`

## Build artifact

CI uses `--no-wait`, so the workflow step exits after queuing.
Use the Expo dashboard build URL to monitor progress and download APK.

## Troubleshooting notes (current)

- If GitHub Actions fails at `npm ci` with lock mismatch:
  - ensure both root `package.json` and `package-lock.json` are committed together.
- If Expo cloud build fails in `Run gradlew` with `expo-module-gradle-plugin` / `ExpoModulesCorePlugin.gradle` errors:
  - **Most common cause (SDK 51):** npm installed `expo-font@55.x` as a peer of `@expo/vector-icons` (`expo-font: *` resolves to latest). That version targets a newer Expo SDK and breaks Gradle on SDK 51.
  - **Fix:** pin `expo-font` to `~12.0.10` (direct dependency + root `overrides`), then `npm install` and commit lockfile. Run `npx expo-doctor` — it must pass before cloud build.
- If EAS `expo doctor` fails on version skew:
  - align `react-native`, `react-native-svg`, and `typescript` to versions `expo-doctor` reports for your SDK (or run `npx expo install --fix` from `packages/mobile`).
