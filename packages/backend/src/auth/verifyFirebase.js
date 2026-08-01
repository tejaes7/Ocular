/**
 * Verify a Firebase ID token against Google's public JWKS.
 *
 * This is the boundary that decides who a caller is, so it fails closed: any
 * problem — missing config, bad signature, wrong project, expired token —
 * throws, and the route turns that into a 401. Nothing here returns a partial
 * or "probably fine" identity.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
    new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyFirebaseToken(token, env = {}) {
    const projectId = env?.FIREBASE_PROJECT_ID;

    // No hardcoded fallback on purpose. A default here is invisible when it is
    // wrong: the worker would keep accepting tokens, just from whichever project
    // was baked into this file, and every login would look fine until someone
    // noticed the accounts belonged to a different Firebase project. Refusing to
    // start is the loud version of the same condition.
    if (!projectId) {
        throw new Error(
            "FIREBASE_PROJECT_ID is not set. Add it to [vars] in wrangler.toml."
        );
    }

    const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
    });

    // jose checks the signature, `exp`, `iss` and `aud`. Firebase additionally
    // specifies that `sub` must be a non-empty string, and it is the value we
    // key every user row on — an empty one would collapse distinct people onto
    // a single row.
    if (typeof payload.sub !== "string" || payload.sub === "") {
        throw new Error("Firebase token has no subject");
    }

    return {
        uid: payload.sub,
        email: payload.email ?? null,
        name: payload.name || "",
        photoURL: payload.picture || ""
    };
}
