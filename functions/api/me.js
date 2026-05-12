import { parseCookie, verifySession, SESSION_COOKIE } from "../_shared/auth.js";

export async function onRequestGet({ request, env }) {
  const token = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const sess = await verifySession(env, token);
  if (!sess) return new Response(JSON.stringify({ authenticated: false }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ authenticated: true, username: sess.username, expiresAt: sess.expiresAt }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
