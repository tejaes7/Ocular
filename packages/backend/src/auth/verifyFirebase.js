/**
 * Verify Firebase ID Token using Google's public JWKS.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
    new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

const PROJECT_ID = "ocularx-59561";   // <-- Replace if your Firebase Project ID is different

export async function verifyFirebaseToken(token) {

    const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${PROJECT_ID}`,
        audience: PROJECT_ID,
    });

    return {
        uid: payload.sub,
        email: payload.email,
        name: payload.name || "",
        photoURL: payload.picture || ""
    };
}