import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
import { getCurrentUser } from "../api";

const provider = new GoogleAuthProvider();

export async function login() {

    try {

        const result = await signInWithPopup(auth, provider);

        const token = await result.user.getIdToken();

        console.log("Firebase Token:", token);

        const user = await getCurrentUser(token);

        console.log("Backend Response:", user);

        return user;

    } catch (err) {

        console.error(err);

        throw err;

    }

}