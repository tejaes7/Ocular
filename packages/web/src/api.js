export async function getCurrentUser(token) {

    const response = await fetch("http://127.0.0.1:8787/me", {

        method: "GET",

        headers: {
            Authorization: `Bearer ${token}`
        }

    });

    return await response.json();
}