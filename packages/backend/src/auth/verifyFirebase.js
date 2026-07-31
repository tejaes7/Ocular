/**
 * Verify Firebase ID Token using Google's public JWKS.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
    new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

const DEFAULT_PROJECT_ID = "ocularx-59561";

export async function verifyFirebaseToken(token, env = {}) {
    const projectId = env?.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;

    const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
    });

    return {
        uid: payload.sub,
        email: payload.email,
        name: payload.name || "",
        photoURL: payload.picture || ""
    };
}