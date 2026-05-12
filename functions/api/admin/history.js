import { requireAuth } from "../../_shared/auth.js";

// GET /api/admin/history → list versioned snapshots, newest first.
// Each item: { key, savedAt, bytes, replacedBy }
export async function onRequestGet({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const list = await env.CATALOG_KV.list({ prefix: "catalog:v:" });
  const items = (list.keys || [])
    .map(k => ({
      key: k.name,
      savedAt: k.metadata?.savedAt || k.name.replace("catalog:v:", ""),
      bytes: k.metadata?.bytes ?? null,
      replacedBy: k.metadata?.replacedBy ?? null,
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  // Also include the current catalog as a virtual "current" entry.
  const currentMeta = await env.CATALOG_KV.getWithMetadata("catalog");
  let current = null;
  if (currentMeta?.value != null) {
    current = {
      bytes: currentMeta.metadata?.bytes ?? currentMeta.value.length,
      updatedAt: currentMeta.metadata?.updatedAt || null,
      updatedBy: currentMeta.metadata?.updatedBy || null,
    };
  }

  return new Response(JSON.stringify({ ok: true, current, versions: items }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}
