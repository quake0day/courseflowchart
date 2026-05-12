# CSC Course Flowchart

An interactive curriculum map for the
[West Chester University Computer Science department](https://catalog.wcupa.edu/undergraduate/sciences-mathematics/computer-science/).
Single-page, static, runs entirely in the browser. D3 + a small custom column
layout for the chart, vanilla DOM for everything else.

Live: <https://courseflowchart.pages.dev/>

```
.
├── public/
│   └── index.html       The whole app — HTML, CSS, JS, and the catalog text.
├── wrangler.toml        Cloudflare Pages project config.
├── .gitignore
└── README.md
```

## Program views

The same chart serves five different program views via hash routing:

| Path                  | View                                    |
| --------------------- | --------------------------------------- |
| `/`                   | BS in Computer Science (default)        |
| `/#/minor/cs`         | Minor in Computer Science               |
| `/#/minor/it`         | Minor in Information Technology         |
| `/#/ms`               | MS in Computer Science                  |
| `/#/ms/accelerated`   | Accelerated BS → MS                     |

Each view filters the underlying catalog to just the courses in that program.
The Accelerated view also draws the nine mutual-exclusion course pairs
(`CSC 525 ↔ CSC 331`, …) as red dashed links and adds a red `!` badge on
each card in a pair. Hovering or tapping one course in a pair puts a big
red ✕ on its partner.

## Features

- **Column-based layout** — each course level (100 / 200 / 300 / 400 / 500 /
  600) is its own column; long columns wrap into sub-columns automatically.
- **Mobile layout** — sidebar becomes a left drawer, details panel becomes
  a bottom sheet, first-time hint explains tap / double-tap / drag.
- **Map Key floating panel** on wide desktops; auto-positions out of the way
  of the details panel; draggable.
- **Cybersecurity** and **Cloud Engineering** certificates are highlighted
  via the sidebar's Programs filter. Member courses show a green `S` or
  pink `C` dot on the card.
- **Junior standing** is rendered as a virtual node in the Prerequisites
  column with a dashed amber edge to the BS courses that accept it as an
  alternative prereq.
- **Program rules** sidebar section lists the WCU stipulations for the MS
  and Accelerated programs.

## Updating the catalog

The catalog is a single template literal in
[`public/index.html`](public/index.html) named `DEFAULT_CATALOG`. Each course
is one block:

```
CSC 141. Computer Science I. 3 Credits. <description>. Prerequisite: CSC NNN.
```

The parser also accepts `Prerequisites:`, `Pre / Co requisites:`, and the
`CSC NNN Prerequisite: …` form. It extracts course codes after the
prerequisite keyword and treats `{… or …}` groups as additional prereqs.

Course-level metadata (which program it belongs to, certificate flags,
accelerated-MS pairing, free-text prereq notes, etc.) lives in the
`COURSE_META` object right next to `DEFAULT_CATALOG`. To add a new course,
add a block to `DEFAULT_CATALOG` and, if it needs metadata, a matching
entry in `COURSE_META`.

To add a new mutual-exclusion pair for the Accelerated program, append to
`ACCEL_EXCLUSIONS`:

```js
const ACCEL_EXCLUSIONS = [
  ['CSC 525', 'CSC 331'], // Operating Systems
  // …
];
```

## Deploy

Hosted on [Cloudflare Pages](https://pages.cloudflare.com/) (project name
`courseflowchart`). After editing `public/index.html`:

```bash
# Push changes to GitHub (history).
git add . && git commit -m "update catalog" && git push

# Publish to Cloudflare Pages production.
wrangler pages deploy public --project-name courseflowchart
```

There is no build step — the file in `public/` is served as-is.

### One-time setup for a new machine

```bash
# 1. Install wrangler.
brew install cloudflare-wrangler   # or  npm install -g wrangler

# 2. Log in to Cloudflare.
wrangler login

# 3. Verify the Pages project exists; if not:
#    wrangler pages project create courseflowchart --production-branch main
```

### Optional: connect CF Pages to this repo for auto-deploy on push

In the Cloudflare dashboard:

1. Workers & Pages → `courseflowchart` → Settings → Builds & deployments.
2. Connect Git → choose this GitHub repo, branch `main`.
3. Build command: leave empty. Build output directory: `public`.

After that, every `git push origin main` triggers a Pages deployment
automatically.

## Local preview

```bash
# Cheap option — works for everything except the legacy /api/catalog
# fallback (which the app no longer needs).
open public/index.html

# Or with wrangler (matches the deployed env).
wrangler pages dev public
```

## Stack

- [D3 v7](https://d3js.org/) (via CDN) — rendering, zoom, transitions.
- A small custom Sugiyama-style column layout — no `dagre` dependency.
- Cloudflare Pages — static hosting + global CDN.

## License

Internal department use.
