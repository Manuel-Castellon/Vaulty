/**
 * Acceptance check for the Amplify v6 upgrade: a session the old library
 * (amazon-cognito-identity-js, kept as a devDependency only for this test)
 * wrote to SecureStore through the old adapter is picked up by Amplify's real
 * token store through SecureTokenStorage, same user and same sub.
 */

const mockSecureStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecureStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecureStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecureStore.delete(k)),
}));

// Amplify's default (non-token) storage on React Native; the package ships a
// mock. Amplify reads `.default`, so expose it as an ES module.
jest.mock("@react-native-async-storage/async-storage", () => {
  const mock = require("@react-native-async-storage/async-storage/jest/async-storage-mock");
  return { __esModule: true, default: mock.default ?? mock };
});

import {
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  CognitoIdToken,
  CognitoAccessToken,
  CognitoRefreshToken,
} from "amazon-cognito-identity-js";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { SecureTokenStorage } from "../services/auth";

const POOL_ID = "us-east-1_testpool";
const CLIENT_ID = "testclientid123";
const SUB = "4f0c8a1e-1111-2222-3333-444455556666";

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "RS256", kid: "k" })}.${b64url(payload)}.sig`;
}

// The pre-Amplify SecureCognitoStorage: synchronous for the old library,
// persisting each key to SecureStore with [^a-zA-Z0-9._-] replaced by "_".
const sanitize = (k: string) => k.replace(/[^a-zA-Z0-9._-]/g, "_");
const oldAdapter = {
  setItem: (k: string, v: string) => void mockSecureStore.set(sanitize(k), v),
  getItem: (k: string) => mockSecureStore.get(sanitize(k)) ?? null,
  removeItem: (k: string) => void mockSecureStore.delete(sanitize(k)),
  clear: () => mockSecureStore.clear(),
};

it("Amplify reads the old library's SecureStore session without a network call", async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const idToken = jwt({ sub: SUB, email: "a@b.com", exp, iat: exp - 3600, aud: CLIENT_ID });
  const accessToken = jwt({ sub: SUB, username: SUB, exp, iat: exp - 3600, client_id: CLIENT_ID });

  // What the old library did after authenticateUser (email-as-username pools
  // store tokens under the sub, which Cognito returns as USER_ID_FOR_SRP).
  const pool = new CognitoUserPool({ UserPoolId: POOL_ID, ClientId: CLIENT_ID, Storage: oldAdapter });
  const user = new CognitoUser({ Username: SUB, Pool: pool, Storage: oldAdapter });
  user.setSignInUserSession(
    new CognitoUserSession({
      IdToken: new CognitoIdToken({ IdToken: idToken }),
      AccessToken: new CognitoAccessToken({ AccessToken: accessToken }),
      RefreshToken: new CognitoRefreshToken({ RefreshToken: "refresh-token-value" }),
    })
  );
  expect(mockSecureStore.get(`CognitoIdentityServiceProvider.${CLIENT_ID}.LastAuthUser`)).toBe(SUB);

  // The service configured Amplify from EXPO_PUBLIC_* vars (undefined under
  // jest); point it at the test pool. configure() resets the token store, so
  // re-apply SecureTokenStorage the same way the service does.
  Amplify.configure({ Auth: { Cognito: { userPoolId: POOL_ID, userPoolClientId: CLIENT_ID } } });
  cognitoUserPoolsTokenProvider.setKeyValueStorage(SecureTokenStorage);
  const { tokens } = await fetchAuthSession();

  expect(tokens?.idToken?.toString()).toBe(idToken);
  expect(tokens?.idToken?.payload.sub).toBe(SUB);
  expect(tokens?.accessToken.toString()).toBe(accessToken);
});
