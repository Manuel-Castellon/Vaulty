// Sets Expo public env vars before any module is loaded in Jest.
// These must match what the test mocks expect.
process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID = "test-client-id";
process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_testpool";
process.env.EXPO_PUBLIC_COGNITO_DOMAIN = "test.auth.us-east-1.amazoncognito.com";
