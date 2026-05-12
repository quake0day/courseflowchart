// HMAC-signed session cookies. Format:
//   <base64url(payload)>.<base64url(sha256-hmac(secret, payload))>
// where payload is `${username}|${expiresAt}`. Constant-time signature
// comparison; cookie set httpOnly + Secure + SameSite=Lax.

const COOKIE_NAME = "sess";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDec(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function issueSession(env, username) {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not set");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${username}|${expiresAt}`;
  const sig = await hmac(secret, payload);
  return `${b64url(enc.encode(payload))}.${b64url(sig)}`;
}

export async function verifySession(env, cookieValue) {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  let payloadStr;
  try { payloadStr = dec.decode(b64urlDec(parts[0])); } catch { return null; }
  const [username, expiresAtStr] = payloadStr.split("|");
  const expiresAt = Number(expiresAtStr);
  if (!username || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;
  const secret = env.SESSION_SECRET;
  if (!secret) return null;
  const expected = b64url(await hmac(secret, payloadStr));
  if (!timingSafeEqual(expected, parts[1])) return null;
  return { username, expiresAt };
}

export function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function sessionCookie(value, { maxAgeSec = 24 * 60 * 60 } = {}) {
  const v = value === null
    ? `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
    : `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
  return v;
}

export const SESSION_COOKIE = COOKIE_NAME;

// Helper used by every admin endpoint.
export async function requireAuth(request, env) {
  const cookie = parseCookie(request.headers.get("cookie"), COOKIE_NAME);
  const sess = await verifySession(env, cookie);
  if (!sess) {
    return { ok: false, response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } }) };
  }
  return { ok: true, session: sess };
}

export function constantTimeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
