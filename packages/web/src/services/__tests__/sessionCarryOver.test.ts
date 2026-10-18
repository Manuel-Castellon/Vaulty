// Acceptance check for the Amplify v6 upgrade: a session written by the old
// library (amazon-cognito-identity-js, kept as a devDependency only for this
// test) is picked up by Amplify's real token store, same user and same sub.
import { describe, it, expect, beforeEach } from "vitest";
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

const POOL_ID = "us-east-1_testpool";
const CLIENT_ID = "testclientid123";
const SUB = "4f0c8a1e-1111-2222-3333-444455556666";

function b64url(obj: object): string {
  return btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "RS256", kid: "k" })}.${b64url(payload)}.sig`;
}

beforeEach(() => localStorage.clear());

describe("session carry-over from amazon-cognito-identity-js", () => {
  it("Amplify reads the old library's localStorage session without a network call", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const idToken = jwt({ sub: SUB, email: "a@b.com", exp, iat: exp - 3600, aud: CLIENT_ID });
    const accessToken = jwt({ sub: SUB, username: SUB, exp, iat: exp - 3600, client_id: CLIENT_ID });

    // What the old library did after authenticateUser (email-as-username pools
    // store tokens under the sub, which Cognito returns as USER_ID_FOR_SRP).
    const pool = new CognitoUserPool({ UserPoolId: POOL_ID, ClientId: CLIENT_ID, Storage: localStorage });
    const user = new CognitoUser({ Username: SUB, Pool: pool, Storage: localStorage });
    user.setSignInUserSession(
      new CognitoUserSession({
        IdToken: new CognitoIdToken({ IdToken: idToken }),
        AccessToken: new CognitoAccessToken({ AccessToken: accessToken }),
        RefreshToken: new CognitoRefreshToken({ RefreshToken: "refresh-token-value" }),
      })
    );
    expect(localStorage.getItem(`CognitoIdentityServiceProvider.${CLIENT_ID}.LastAuthUser`)).toBe(SUB);

    Amplify.configure({ Auth: { Cognito: { userPoolId: POOL_ID, userPoolClientId: CLIENT_ID } } });
    const { tokens } = await fetchAuthSession();

    expect(tokens?.idToken?.toString()).toBe(idToken);
    expect(tokens?.idToken?.payload.sub).toBe(SUB);
    expect(tokens?.accessToken.toString()).toBe(accessToken);
  });
});
