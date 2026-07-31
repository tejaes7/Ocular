import { json } from "../lib/http.js";
import { verifyFirebaseToken } from "../auth/verifyFirebase.js";
import { findUserByFirebaseUID, createUser } from "../db/users.js";

export async function getCurrentUser(request, env) {

    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
        return json({
            ok: false,
            error: "Authorization header missing"
        }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    let firebaseUser;

    try {

        firebaseUser = await verifyFirebaseToken(token);

    } catch (err) {
        console.error("Firebase verification failed:",err);

        return json({
            ok: false,
            error: "Invalid Firebase Token"
        }, 401);

    }

    let user = await findUserByFirebaseUID(env.DB, firebaseUser.uid);

    if (!user) {

        await createUser(env.DB, firebaseUser);

        user = await findUserByFirebaseUID(env.DB, firebaseUser.uid);

    }

    return json({
        ok: true,
        user
    });

}