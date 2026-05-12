import { requireAuth } from "../../_shared/auth.js";

const MAX_BYTES = 512 * 1024; // 512 KB

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const body = await request.text();
  if (body.length > MAX_BYTES) {
    return json({ error: `payload too large (>${MAX_BYTES} bytes)` }, 413);
  }
  await env.CATALOG_KV.put("catalog", body, {
    metadata: { updatedAt: new Date().toISOString(), updatedBy: auth.session.username },
  });
  return json({ ok: true, bytes: body.length, updatedBy: auth.session.username });
}

export async function onRequest({ request }) {
  if (request.method === "POST") return;
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
