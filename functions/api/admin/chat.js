import { requireAuth } from "../../_shared/auth.js";

// Default model: fast, strong, big context. Override per-request from the
// client by sending { model: "@cf/..." }.
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT = `You are a curriculum-flowchart maintenance assistant for the West Chester University Computer Science department's interactive flowchart at https://courseflowchart.pages.dev/. You help the admin (one Professor Chen) edit two pieces of data that live in public/index.html:

1. DEFAULT_CATALOG — a single template literal whose courses each follow:
     CSC NNN. Title. N Credits. <description> Prerequisite: CSC NNN and CSC NNN.
   The parser accepts "Prerequisite", "Prerequisites", "Pre / Co requisites", and the "CSC NNN Prerequisite:" form, and extracts every CSC/MAT/STA/ECO/CST/CSW code mentioned after the keyword. Self-references are stripped. {... or ...} groups become separate prereqs.

2. COURSE_META — a JS object keyed by course code. Per-course fields:
     category    : 'core' | 'capstone' | 'elective' | 'independent' | 'topics'
     certs       : array, members are 'cybersec' or 'cloud'
     programs    : array. Tags: 'bs', 'minor-cs', 'minor-it', 'ms', 'ms-accel', 'cert-prog-fund'. A course is included in a view's chart only if its programs array contains the view's tag (BS view also includes courses with no programs field).
     accelGrad   : the matching MS course code (BS-side of an accelerated pair)
     altPrereqs  : array of standing codes (e.g. ['Junior']) — virtual prereq nodes
     prereqNote  : free-text prereq line shown in the details panel (e.g. "Successful completion of any three CSC/CST/CSW courses").

There are also constants ACCEL_EXCLUSIONS (array of [a, b] pairs) and STANDING_DEFS (currently just 'Junior': 60-89.5 credits).

Your job: when the admin asks for a change, return BOTH (a) a one-sentence explanation, and (b) a fenced code block with ONLY the JSON object describing the patch. Use this schema:

\`\`\`json
{
  "catalogPatch": "<full replacement DEFAULT_CATALOG text>",   // optional
  "metaPatch": { "CSC 305": { "category": "elective", "programs": ["bs"] } }, // optional, merged into COURSE_META
  "metaRemove": ["CSC 999"],                                   // optional, deletes those keys
  "exclusionsAdd": [["CSC 525", "CSC 331"]],                  // optional
  "exclusionsRemove": [["CSC 525", "CSC 331"]]                // optional
}
\`\`\`

If the user is asking a question and not requesting an edit, just answer in plain text — no JSON block.

Rules:
- NEVER invent course numbers that don't exist in the user's data unless they explicitly add them.
- When in doubt, ask one clarifying question instead of guessing.
- Keep replies short — 1-3 short paragraphs max, plus the JSON block when relevant.`;

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json body" }, 400); }
  const { messages, model, context } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages array required" }, 400);
  }

  // Build the prompt by injecting the current data as the first turn.
  const contextSummary = buildContextSummary(context || {});
  const fullMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: contextSummary },
    ...messages.filter(m => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")),
  ];

  try {
    const result = await env.AI.run(model || DEFAULT_MODEL, {
      messages: fullMessages,
      max_tokens: 1200,
      temperature: 0.4,
    });
    const reply = result?.response || result?.result || "";
    return json({ ok: true, reply, model: model || DEFAULT_MODEL });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
}

function buildContextSummary({ catalog, meta, exclusions }) {
  const cat = typeof catalog === "string" ? catalog : "(client did not send catalog)";
  const metaStr = typeof meta === "string" ? meta : JSON.stringify(meta || {}, null, 2);
  const exclStr = JSON.stringify(exclusions || [], null, 2);
  return [
    "Current curriculum data follows. Refer to it when reasoning about edits.",
    "",
    "--- DEFAULT_CATALOG ---",
    truncate(cat, 25000),
    "",
    "--- COURSE_META ---",
    truncate(metaStr, 10000),
    "",
    "--- ACCEL_EXCLUSIONS ---",
    exclStr,
  ].join("\n");
}

function truncate(s, n) {
  if (typeof s !== "string") return "";
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n…(truncated, original ${s.length} chars)`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

export async function onRequest({ request }) {
  if (request.method === "POST") return;
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
