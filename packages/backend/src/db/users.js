/**
 * User rows for optional accounts.
 *
 * `firebase_uid` is the only identity key. Nothing in here touches the price
 * tables — see the note at the top of migrations/0002_users.sql.
 */

export async function findUserByFirebaseUID(db, uid) {
    return db.prepare(
        "SELECT * FROM users WHERE firebase_uid = ?"
    ).bind(uid).first();
}

/**
 * Create the row on first login, refresh it on every later one.
 *
 * An upsert rather than a check-then-insert for two reasons. Two sign-ins
 * racing on a brand-new uid would both see "no user" and both INSERT, and the
 * loser would hit the UNIQUE constraint and 500 on an ordinary login. And a
 * separate re-SELECT afterwards can come back empty, which would hand the caller
 * `{ ok: true, user: null }` — a success response carrying no user. `RETURNING`
 * closes both: one round trip, and the row is either returned or the statement
 * threw.
 *
 * The UPDATE arm also keeps display name and photo current when someone changes
 * them on the Google side.
 */
export async function upsertUser(db, firebaseUser) {
    return db.prepare(`
        INSERT INTO users (firebase_uid, email, display_name, photo_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(firebase_uid) DO UPDATE SET
            email        = excluded.email,
            display_name = excluded.display_name,
            photo_url    = excluded.photo_url,
            updated_at   = CURRENT_TIMESTAMP
        RETURNING *
    `)
    .bind(
        firebaseUser.uid,
        firebaseUser.email ?? null,
        firebaseUser.name || null,
        firebaseUser.photoURL || null
    )
    .first();
}
