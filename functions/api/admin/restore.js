import { requireAuth } from "../../_shared/auth.js";

// POST /api/admin/restore { key: "catalog:v:<timestamp>" }
// Body alternative: { useEmbeddedDefault: true } — delete the current
// catalog so the public page falls back to the file-embedded default.
export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }

  if (body?.useEmbeddedDefault) {
    // Snapshot current first so this is itself reversible.
    const cur = await env.CATALOG_KV.get("catalog");
    if (cur) {
      const ts = new Date().toISOString();
      await env.CATALOG_KV.put(`catalog:v:${ts}`, cur, {
        metadata: { savedAt: ts, bytes: cur.length, replacedBy: auth.session.username, note: "before-embedded-default" },
      });
    }
    await env.CATALOG_KV.delete("catalog");
    return json({ ok: true, restoredTo: "embedded-default" });
  }

  const key = body?.key;
  if (typeof key !== "string" || !key.startsWith("catalog:v:")) {
    return json({ error: "invalid key" }, 400);
  }
  const text = await env.CATALOG_KV.get(key);
  if (text == null) return json({ error: "version not found" }, 404);

  // Snapshot current before overwriting.
  const cur = await env.CATALOG_KV.get("catalog");
  if (cur != null && cur !== text) {
    const ts = new Date().toISOString();
    await env.CATALOG_KV.put(`catalog:v:${ts}`, cur, {
      metadata: { savedAt: ts, bytes: cur.length, replacedBy: auth.session.username, note: `before-restore-of-${key}` },
    });
  }
  await env.CATALOG_KV.put("catalog", text, {
    metadata: { updatedAt: new Date().toISOString(), updatedBy: auth.session.username, bytes: text.length, restoredFrom: key },
  });
  return json({ ok: true, restoredFrom: key, bytes: text.length });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
