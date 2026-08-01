import { json } from "../lib/http.js";
import { verifyFirebaseToken } from "../auth/verifyFirebase.js";
import { upsertUser } from "../db/users.js";

/**
 * GET /me — resolve a Firebase ID token to an account, creating it on first use.
 *
 * Accounts are optional and exist only to sync a watchlist across a person's own
 * devices. `/sync` still authenticates with the anonymous device UUID and is
 * unaffected by this route; the two identities are never joined. See docs/API.md.
 *
 * `verify` is injectable so the route's own logic can be tested without a
 * network round trip to Google's JWKS endpoint. Production callers pass nothing.
 */
export async function getCurrentUser(request, env, verify = verifyFirebaseToken) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
        return json({ ok: false, error: "Authorization header missing" }, 401);
    }

    // Require the scheme, rather than stripping an optional "Bearer " prefix.
    // Stripping lets a header of exactly `Authorization: Bearer` fall through
    // with the literal string "Bearer" as the credential — the Headers API trims
    // the trailing space, so there is nothing left for a prefix match to remove.
    // That reaches the verifier as if it were a real token.
    const scheme = /^Bearer\s+(\S.*)$/i.exec(authHeader.trim());

    if (!scheme) {
        return json({ ok: false, error: "Expected an Authorization: Bearer <token> header" }, 401);
    }

    const token = scheme[1].trim();

    let firebaseUser;
    try {
        firebaseUser = await verify(token, env);
    } catch (err) {
        // The token itself is never logged — it is a bearer credential and the
        // logs are not the place for one.
        console.error("[Auth] Firebase verification failed:", err?.message ?? err);
        return json({ ok: false, error: "Invalid Firebase token" }, 401);
    }

    let user;
    try {
        user = await upsertUser(env.DB, firebaseUser);
    } catch (err) {
        console.error("[Auth] Could not persist user:", err?.message ?? err);
        return json({ ok: false, error: "Could not persist user" }, 500);
    }

    if (!user) {
        // Should be unreachable: the upsert either RETURNINGs a row or throws.
        console.error("[Auth] Upsert returned no row for uid:", firebaseUser.uid);
        return json({ ok: false, error: "Could not persist user" }, 500);
    }

    // Shaped explicitly rather than spreading the row — `SELECT *` would leak the
    // autoincrement id, and docs/API.md documents these four fields as the
    // contract. Adding a field here means amending that document too.
    return json({
        ok: true,
        user: {
            uid: user.firebase_uid,
            email: user.email ?? null,
            displayName: user.display_name ?? null,
            photoURL: user.photo_url ?? null,
        },
    });
}
