import { fail, json } from "../lib/http.js";
import { verifyFirebaseToken } from "../auth/verifyFirebase.js";
import { findUserByFirebaseUID, upsertUser } from "../db/users.js";

/**
 * GET /me — resolve a Firebase ID token to an account, creating it on first use.
 *
 * Accounts are optional and exist only to sync a watchlist across a person's own
 * devices. `/sync` still authenticates with the anonymous device UUID and is
 * unaffected by this route; the two identities are never joined. See docs/API.md.
 *
 * **There is no separate "register" call, and there should not be one.** Google
 * sign-in either matches an existing account or mints one; the client cannot
 * know which in advance, so asking a visitor to pick "Login" or "Register" makes
 * them guess at something only the server can answer. This route answers it
 * instead: `isNew` says whether this call created the row, so the UI can say
 * "welcome" or "welcome back" without ever turning a returning user away.
 *
 * `verify` is injectable so the route's own logic can be tested without a
 * network round trip to Google's JWKS endpoint. Production callers pass nothing.
 */
export async function getCurrentUser(request, env, verify = verifyFirebaseToken) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
        return fail("MISSING_AUTH_HEADER", "Authorization header missing", 401);
    }

    // Require the scheme, rather than stripping an optional "Bearer " prefix.
    // Stripping lets a header of exactly `Authorization: Bearer` fall through
    // with the literal string "Bearer" as the credential — the Headers API trims
    // the trailing space, so there is nothing left for a prefix match to remove.
    // That reaches the verifier as if it were a real token.
    const scheme = /^Bearer\s+(\S.*)$/i.exec(authHeader.trim());

    if (!scheme) {
        return fail(
            "MALFORMED_AUTH_HEADER",
            "Expected an Authorization: Bearer <token> header",
            401
        );
    }

    const token = scheme[1].trim();

    let firebaseUser;
    try {
        firebaseUser = await verify(token, env);
    } catch (err) {
        // The token itself is never logged — it is a bearer credential and the
        // logs are not the place for one.
        console.error("[Auth] Firebase verification failed:", err?.message ?? err);
        return fail("INVALID_TOKEN", "Invalid Firebase token", 401);
    }

    let user;
    let isNew;
    try {
        // Read before writing purely to answer `isNew`. The upsert below is still
        // what guarantees correctness, so this lookup racing another sign-in is
        // harmless: the worst case is two concurrent first sign-ins both being
        // greeted as new, which is cosmetic. Deriving it from the row instead —
        // comparing created_at to updated_at — would be wrong, because
        // CURRENT_TIMESTAMP has one-second resolution and a fast second call
        // would look like a first one.
        const existing = await findUserByFirebaseUID(env.DB, firebaseUser.uid);
        isNew = !existing;

        user = await upsertUser(env.DB, firebaseUser);
    } catch (err) {
        console.error("[Auth] Could not persist user:", err?.message ?? err);
        return fail("PERSIST_FAILED", "Could not persist user", 500);
    }

    if (!user) {
        // Should be unreachable: the upsert either RETURNINGs a row or throws.
        console.error("[Auth] Upsert returned no row for uid:", firebaseUser.uid);
        return fail("PERSIST_FAILED", "Could not persist user", 500);
    }

    // Shaped explicitly rather than spreading the row — `SELECT *` would leak the
    // autoincrement id, and docs/API.md documents these fields as the contract.
    // Adding a field here means amending that document too.
    return json({
        ok: true,
        isNew,
        user: {
            uid: user.firebase_uid,
            email: user.email ?? null,
            displayName: user.display_name ?? null,
            photoURL: user.photo_url ?? null,
        },
    });
}
