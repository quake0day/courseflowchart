import { sessionCookie } from "../_shared/auth.js";

export async function onRequestPost() {
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", sessionCookie(null));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function onRequest({ request }) {
  if (request.method === "POST") return;
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
