import { issueSession, sessionCookie, constantTimeCompare } from "../_shared/auth.js";

const ADMIN_USERNAME = "schen";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const username = body?.username;
  const password = body?.password;
  if (!username || !password) {
    return json({ error: "username and password required" }, 400);
  }
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "server is missing ADMIN_PASSWORD or SESSION_SECRET" }, 500);
  }
  // Tiny mitigation against timing-based username probing.
  const userOk = constantTimeCompare(username, ADMIN_USERNAME);
  const passOk = constantTimeCompare(password, env.ADMIN_PASSWORD);
  if (!userOk || !passOk) {
    // Small constant delay; not bullet-proof but makes brute force noisier.
    await new Promise(r => setTimeout(r, 250));
    return json({ error: "invalid credentials" }, 401);
  }
  const token = await issueSession(env, ADMIN_USERNAME);
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", sessionCookie(token));
  return new Response(JSON.stringify({ ok: true, username: ADMIN_USERNAME }), { status: 200, headers });
}

export async function onRequest({ request }) {
  if (request.method === "POST") return;
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
