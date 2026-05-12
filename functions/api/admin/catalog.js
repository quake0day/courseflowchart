import { requireAuth } from "../../_shared/auth.js";

const MAX_BYTES = 512 * 1024; // 512 KB
const HISTORY_LIMIT = 20;     // Keep at most this many snapshots

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const body = await request.text();
  if (body.length > MAX_BYTES) {
    return json({ error: `payload too large (>${MAX_BYTES} bytes)` }, 413);
  }

  // Snapshot the *current* catalog before overwriting, so it can be restored later.
  const prev = await env.CATALOG_KV.get("catalog");
  if (prev != null && prev !== body) {
    const ts = new Date().toISOString();
    const key = `catalog:v:${ts}`;
    await env.CATALOG_KV.put(key, prev, {
      metadata: { savedAt: ts, bytes: prev.length, replacedBy: auth.session.username },
    });
    // Trim oldest snapshots past HISTORY_LIMIT.
    await pruneHistory(env, HISTORY_LIMIT);
  }

  const now = new Date().toISOString();
  await env.CATALOG_KV.put("catalog", body, {
    metadata: { updatedAt: now, updatedBy: auth.session.username, bytes: body.length },
  });
  return json({ ok: true, bytes: body.length, updatedBy: auth.session.username, savedAt: now });
}

async function pruneHistory(env, limit) {
  const list = await env.CATALOG_KV.list({ prefix: "catalog:v:" });
  if (!list.keys || list.keys.length <= limit) return;
  // Keys end in ISO timestamps → lexicographic sort = chronological.
  const sorted = list.keys.map(k => k.name).sort();
  const toDelete = sorted.slice(0, sorted.length - limit);
  await Promise.all(toDelete.map(k => env.CATALOG_KV.delete(k)));
}

export async function onRequest({ request }) {
  if (request.method === "POST") return;
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
