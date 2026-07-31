export async function findUserByFirebaseUID(db, uid) {

    const result = await db.prepare(
        "SELECT * FROM users WHERE firebase_uid = ?"
    ).bind(uid).first();

    return result;
}

export async function createUser(db, firebaseUser) {

    await db.prepare(`
        INSERT INTO users
        (firebase_uid,email,display_name,photo_url)
        VALUES(?,?,?,?)
    `)
    .bind(
        firebaseUser.uid,
        firebaseUser.email,
        firebaseUser.name,
        firebaseUser.photoURL
    )
    .run();

}