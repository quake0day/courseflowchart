// GET /api/catalog — public.
// Returns the catalog text from KV, or 204 No Content if nothing has been
// saved yet (the static page then falls back to the embedded default).
export async function onRequestGet({ env }) {
  const text = await env.CATALOG_KV.get("catalog");
  if (!text) return new Response(null, { status: 204 });
  return new Response(text, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequest({ request }) {
  if (request.method === "GET" || request.method === "HEAD") return;
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET" } });
}
