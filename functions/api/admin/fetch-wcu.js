import { requireAuth } from "../../_shared/auth.js";

// Catalog pages we scrape. Each course block looks like:
//   <p class="courseblocktitle"><strong>CSC&nbsp;141.&nbsp;Computer Science I.&nbsp;3 Credits.</strong></p>
//   <p class="courseblockdesc">An introduction to programming using Python ...</p>
//   <p class="courseblockextra">CSC 141 Prerequisite: ...</p>
//   <p class="noindent">Gen Ed Attribute: ...</p>
//   ... more <p class="noindent"> for distance ed / repeatable.
//
// We extract each block and emit the plain-text format the front-end parser
// already accepts: "CSC NNN. Title. N Credits. <description> Prerequisite: ..."
const SOURCES = {
  ug:   "https://catalog.wcupa.edu/undergraduate/sciences-mathematics/computer-science/",
  grad: "https://catalog.wcupa.edu/graduate/sciences-mathematics/computer-science/",
};

export async function onRequestPost({ request, env }) {
  const auth = await requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const results = {};
  for (const [key, url] of Object.entries(SOURCES)) {
    try {
      const html = await fetchText(url);
      results[key] = parseCatalog(html);
    } catch (err) {
      results[key] = { error: String(err?.message || err) };
    }
  }

  const ugCourses = Array.isArray(results.ug?.courses) ? results.ug.courses : [];
  const gradCourses = Array.isArray(results.grad?.courses) ? results.grad.courses : [];
  const all = [...ugCourses, ...gradCourses];
  const text = all.map(formatCourse).join("\n\n");

  return new Response(JSON.stringify({
    ok: true,
    counts: { ug: ugCourses.length, grad: gradCourses.length, total: all.length },
    text,
    sources: SOURCES,
    errors: Object.fromEntries(Object.entries(results).filter(([, v]) => v?.error)),
  }), { status: 200, headers: { "content-type": "application/json" } });
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: { "user-agent": "courseflowchart-bot/1.0 (admin sync)" },
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  return await r.text();
}

function parseCatalog(html) {
  const courses = [];
  // Each course is wrapped in <div class="courseblock"> ... </div>. Its
  // children are <p> elements only — no nested divs — so a non-greedy
  // match between courseblock and the first </div> is safe.
  const blocks = matchAll(html, /<div\s+class="courseblock">([\s\S]*?)<\/div>/g);
  for (const m of blocks) {
    const block = m[1];
    const title = textOf(firstMatch(block, /<p\s+class="[^"]*\bcourseblocktitle\b[^"]*"[^>]*>([\s\S]*?)<\/p>/));
    if (!title) continue;
    const header = parseHeader(title);
    if (!header) continue;
    // WCU uses compound class names ("noindent courseblockdesc",
    // "noindent courseblock__prereq", etc.) — match by word boundary.
    const desc   = textOf(firstMatch(block, /<p\s+class="[^"]*\bcourseblockdesc\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)) || "";
    const prereq = textOf(firstMatch(block, /<p\s+class="[^"]*\bcourseblock__prereq\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)) || "";
    // Other annotation paragraphs (Gen Ed Attribute, Distance education, Repeatable…)
    // use bare class="noindent". Skip the desc/prereq paragraphs we already grabbed.
    const extras = matchAll(block, /<p\s+class="([^"]*)"[^>]*>([\s\S]*?)<\/p>/g)
      .filter(x => {
        const cls = x[1];
        if (!/\bnoindent\b/.test(cls)) return false;
        if (/\bcourseblockdesc\b/.test(cls)) return false;
        if (/\bcourseblock__prereq\b/.test(cls)) return false;
        return true;
      })
      .map(x => textOf(x[2]))
      .filter(Boolean);
    courses.push({ ...header, desc, prereq, extras });
  }
  return { courses };
}

function parseHeader(rawTitle) {
  // rawTitle examples:
  //   "CSC 141. Computer Science I. 3 Credits."
  //   "CSC 400. Internship. 3-6 Credits."
  //   "CSC 199. Computer Science Transfer Credits. 1-10 Credits."
  const m = rawTitle.match(/^([A-Z]{2,4})\s+(\d{3})\.\s+(.+?)\.\s+([\d\-]+)\s+Credits?\.?$/);
  if (!m) return null;
  return { prefix: m[1], num: m[2], title: m[3].trim(), credits: m[4] };
}

function formatCourse(c) {
  let out = `${c.prefix} ${c.num}. ${c.title}. ${c.credits} Credits.`;
  if (c.desc)   out += " " + c.desc;
  if (c.prereq) out += " " + c.prereq;
  for (const e of c.extras) out += " " + e;
  return out;
}

// --- tiny HTML helpers ----------------------------------------------------
function firstMatch(s, re) {
  const m = re.exec(s);
  return m ? m[1] : null;
}
function matchAll(s, re) {
  const out = []; let m;
  while ((m = re.exec(s)) !== null) out.push(m);
  return out;
}
function textOf(html) {
  if (html == null) return "";
  return html
    .replace(/<[^>]+>/g, " ")        // strip tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}
