// Rebel One Initial Project — dashboard logic (plain JavaScript, no framework).
// Loads the small JSON files made by the prep scripts and draws the page.
// All numbers come from those files; nothing here creates or changes data.

import { stateName } from "./lib/states.js";
import { buildSignals, keyFindings, pickLeads, groupProducts, groupPairs, measureValues, describeMeasure, plainGroup, fmt, niceDate } from "./lib/signals.js";
import { coverage211, DATA_PULSE, COUNTS_211, TILE_GRID, CHECKED_ON } from "./lib/coverage211.js";

window.__appStarted = true; // tells index.html the code loaded
const params = new URLSearchParams(location.search);
const app = {
  demo: params.get("demo") === "1",
  atlasIndex: null, cfpbIndex: null,
  st: null, atlasState: null, cfpbState: null,
  measureKey: null, year: "all",
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x) => Number(x).toLocaleString("en-US");
const base = () => (app.demo ? "demo-data" : "data");
const DEMO = () => (app.demo ? `<span class="demo-chip">DEMO DATA, NOT A REAL FINDING</span>` : "");

async function getJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function init() {
  $("demo-banner").hidden = !app.demo;
  [app.atlasIndex, app.cfpbIndex] = await Promise.all([getJson(`${base()}/atlas/index.json`), getJson(`${base()}/cfpb/index.json`)]);
  renderStatus();
  const inA = (s) => Boolean(app.atlasIndex?.states.some((x) => x.state === s));
  const inC = (s) => Boolean(app.cfpbIndex?.states.some((x) => x.state === s));
  // Every state + DC is selectable (211 works everywhere), plus any other place in the loaded data.
  const states = new Set([...TILE_GRID.map((t) => t[0]), ...(app.atlasIndex?.states || []).map((s) => s.state), ...(app.cfpbIndex?.states || []).map((s) => s.state)]);
  const sorted = [...states].sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const sel = $("state-select");
  sel.innerHTML = sorted.map((s) => `<option value="${esc(s)}">${esc(stateName(s))}</option>`).join("");
  const wanted = params.get("state");
  sel.value = sorted.includes(wanted) ? wanted : (sorted.find((s) => inA(s) && inC(s)) || sorted.find((s) => inA(s) || inC(s)) || "AL");
  sel.addEventListener("change", () => loadState(sel.value));
  const ms = app.atlasIndex?.measures || [];
  app.measureKey = ms.length ? pickDefault(baseOf(ms[0])) : null;
  const anyData = Boolean(app.atlasIndex || app.cfpbIndex);
  for (const id of ["signals-block", "ai-block", "sources-wrap", "tables-wrap"]) $(id).hidden = !anyData;
  $("atlas-controls-wrap").hidden = !ms.length;
  $("copy-ai").addEventListener("click", copyAi);
  drawTileMap();
  await loadState(sel.value);
}

function renderStatus() {
  const a = app.atlasIndex, c = app.cfpbIndex;
  const item = (name, idx, extra) => idx
    ? `<li class="ok"><strong>${name}:</strong> loaded ${extra}</li>`
    : `<li class="wait"><strong>${name}:</strong> waiting for data — see README, Step 3.</li>`;
  $("data-status").innerHTML = `<ul class="status-list">
    ${item("Opportunity Atlas", a, a ? `(${a.states.length} states; files: ${esc(a.sourceFiles.join(", "))}; prepared ${esc(a.generated.slice(0, 10))})` : "")}
    ${item("CFPB complaints", c, c ? `(${nf(c.totalComplaints)} complaints, ${esc(c.dateMin)} to ${esc(c.dateMax)}; prepared ${esc(c.generated.slice(0, 10))})` : "")}
    <li class="ok"><strong>211:</strong> links to official dashboards only (no 211 data stored here). Coverage list checked ${esc(CHECKED_ON)}.</li>
  </ul>`;
  let html = "";
  if (!a && !c) {
    html = `<div class="waiting"><h2>Atlas and CFPB data not added yet</h2>
      <p>The 211 section below works now. To fill in the credit and complaint cards and the leads, follow <strong>Step 3 in README.md</strong>, then reload this page.</p>
      ${app.demo ? "" : `<p><a class="btn" href="?demo=1">Preview with DEMO DATA</a> <span class="muted">(made-up Atlas and CFPB numbers, clearly labeled)</span></p>`}</div>`;
  }
  if (app.demo) html = `<p class="demo-note">You're viewing <strong>DEMO DATA, NOT A REAL FINDING</strong> for the Atlas and CFPB cards. <a href="./">Switch to real data</a>.</p>` + html;
  $("status").innerHTML = html;
  $("data-stamp").textContent = [a && `Atlas data prepared ${a.generated.slice(0, 10)}`, c && `CFPB data prepared ${c.generated.slice(0, 10)}`, `211 coverage list checked ${CHECKED_ON}`].filter(Boolean).join(" · ");
}

// ---------- 211 (links to official dashboards; no 211 numbers here) ----------
const ext = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
function render211() {
  const name = stateName(app.st);
  const cov = coverage211(app.st);
  const dp = cov.dataPulse, ct = cov.counts;
  // Short card next to Atlas and CFPB
  $("s211-finding").innerHTML = cov.any
    ? `<h2>${esc(name)} has 211 data on an official dashboard</h2>
       <p>${dp ? `Listed in <strong>211 Data Pulse</strong>.` : ""}${dp && ct ? " " : ""}${ct ? `A <strong>211 Counts</strong> dashboard is available.` : ""} Open it to see the most-requested needs and gaps.</p>
       <p class="meta">The numbers live on the 211 dashboards, not on this site. <a href="#s211">Go to the 211 section</a></p>`
    : `<h2>No 211 data available for ${esc(name)} on the dashboards checked</h2>
       <p>It isn't listed in 211 Data Pulse, and no 211 Counts dashboard was confirmed. This doesn't mean there's no need here.</p>
       <p class="meta"><a href="#s211">See what to check instead</a></p>`;
  // Detailed panel
  const dpBlock = dp
    ? `<article class="src-card yes">
        <p class="status">✓ Listed in 211 Data Pulse</p>
        <h4>${ext(DATA_PULSE.url, "Open 211 Data Pulse")} <span class="fine">and choose ${esc(name)} in its State filter</span></h4>
        <p><strong>Participating provider:</strong> ${ext(dp.providerUrl, dp.provider)}.</p>
        <p><strong>What it shows:</strong> top needs people asked about, top referrals given and top "gaps" (needs with no resource found), filterable by county, ZIP code and more.</p>
        <p><strong>When:</strong> updated monthly; its FAQ says data is added on the 15th of the following month.</p>
        <p class="fine">Includes only data this provider shares. Counts under 10 are hidden. No names are shared with Data Pulse. ${ext(DATA_PULSE.faq, "Read the FAQ")}.</p>
      </article>`
    : `<article class="src-card no">
        <p class="status">No 211 data available in 211 Data Pulse</p>
        <p>${esc(name)} isn't on 211 Data Pulse's ${ext(DATA_PULSE.partners, "list of participating providers")}. Data Pulse currently lists ${Object.keys(DATA_PULSE.providers).length} states. This says nothing about the level of need in ${esc(name)}.</p>
      </article>`;
  const ctBlock = ct
    ? `<article class="src-card yes">
        <p class="status">✓ 211 Counts dashboard confirmed</p>
        <h4>${ext(ct.url, `Open the ${name} 211 Counts dashboard`)}</h4>
        <p><strong>What it shows:</strong> total calls and help requests, top request categories and subcategories, a share marked "unmet", a map by ZIP code, county or legislative district, and month-by-month counts.</p>
        <p><strong>When:</strong> you pick the date range on the dashboard; its notes say how far back data goes varies by call center.</p>
        <p class="fine">Its notes say one caller can make several requests, and call centers code requests differently.</p>
      </article>`
    : `<article class="src-card unknown">
        <p class="status">211 Counts: not confirmed for ${esc(name)}</p>
        <p>211 Counts has public dashboards for many communities (Washington University, Aug 2025: "over 100 communities in 44 states"), but its state list couldn't be checked for this site. Look for ${esc(name)} at ${ext(COUNTS_211.url, "211counts.org")} or on your local 211's website.</p>
      </article>`;
  $("s211-state").innerHTML = `<h3>${esc(name)}</h3><div class="src-cards">${dpBlock}${ctBlock}</div>
    <p class="meta">Neither source offers an API or downloadable data (checked ${esc(CHECKED_ON)}), and 211 Data Pulse doesn't allow being embedded in other sites, so this site links to the official dashboards instead of copying their numbers.</p>`;
  document.querySelectorAll("#tilemap .tile").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.st === app.st)));
}

function drawTileMap() {
  const cols = 12, rows = 8;
  $("tilemap").style.setProperty("--cols", cols);
  $("tilemap").style.setProperty("--rows", rows);
  $("tilemap").innerHTML = TILE_GRID.map(([st, c, r]) => {
    const cov = coverage211(st);
    const label = `${stateName(st)}: ${cov.dataPulse ? "listed in 211 Data Pulse" : "no 211 data available in 211 Data Pulse"}${cov.counts ? "; 211 Counts dashboard confirmed" : ""}`;
    return `<button type="button" class="tile ${cov.dataPulse ? "dp" : "none"}" data-st="${st}" style="grid-column:${c + 1};grid-row:${r + 1}" title="${esc(label)}" aria-label="${esc(label)}" aria-pressed="false">${st}${cov.counts ? `<span class="mark">C</span>` : ""}</button>`;
  }).join("");
  $("tilemap").querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => {
    $("state-select").value = t.dataset.st;
    loadState(t.dataset.st);
    $("s211-state").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  const listed = Object.keys(DATA_PULSE.providers).map(stateName).sort();
  $("tile-text").innerHTML = `<strong>Listed in 211 Data Pulse (${listed.length}):</strong> ${esc(listed.join(", "))}. <strong>211 Counts confirmed:</strong> ${esc(Object.keys(COUNTS_211.confirmed).map(stateName).join(", "))}. All other states and DC: no 211 data available in 211 Data Pulse; 211 Counts not confirmed. Source: ${ext(DATA_PULSE.partners, "211 Data Pulse participating organizations")}, checked ${esc(CHECKED_ON)}.`;
}

async function loadState(st) {
  app.st = st;
  app.year = "all";
  const inAtlas = app.atlasIndex?.states.some((x) => x.state === st);
  const inCfpb = app.cfpbIndex?.states.some((x) => x.state === st);
  [app.atlasState, app.cfpbState] = await Promise.all([
    inAtlas ? getJson(`${base()}/atlas/${st}.json`) : null,
    inCfpb ? getJson(`${base()}/cfpb/${st}.json`) : null,
  ]);
  const u = new URL(location.href); u.searchParams.set("state", st); history.replaceState(null, "", u);
  renderAll();
}

function currentMeasure() { return app.atlasIndex?.measures.find((m) => m.key === app.measureKey) || null; }
function renderAll() { render211(); renderSummary(); renderAtlasControls(); renderAtlasTable(); renderCfpb(); renderAi(); }

// ---------- Key findings + leads ----------
function renderSummary() {
  const ctx = { stateLabel: stateName(app.st), atlasState: app.atlasState, measure: currentMeasure(), cfpb: app.cfpbState };
  const kf = keyFindings(ctx);
  const card = (f, extra = "") => f.missing
    ? `<p class="empty">${esc(f.missing)}</p>`
    : `${DEMO()}<h2>${esc(f.headline)}</h2><p>${esc(f.text)}</p>${extra}`;
  $("atlas-finding").innerHTML = card(kf.atlas, kf.atlas.group ? `<p class="meta">Shown for: ${esc(kf.atlas.group)}.</p>` : "");
  $("cfpb-finding").innerHTML = card(kf.cfpb);
  $("cfpb-scope").textContent = app.cfpbState ? `Whole state · ${niceDate(app.cfpbState.dateMin)} – ${niceDate(app.cfpbState.dateMax)}` : "Whole state · dates shown when data is loaded";

  const { signals, skipped } = buildSignals(ctx);
  const leads = pickLeads(signals);
  $("signals").innerHTML = `${DEMO()}
    ${leads.length ? `<div class="leads">${leads.map((s, i) => `
      <article class="lead">
        <p class="hyp">Hypothesis ${i + 1} <span>· not a finding</span></p>
        <h3>${esc(s.hypothesis)}</h3>
        <dl>
          <dt>What the data shows</dt><dd>${esc(s.shows)}</dd>
          <dt>Why it could matter</dt><dd>${esc(s.why)}</dd>
          <dt>Next step to check it</dt><dd>${esc(s.next)}</dd>
        </dl>
        <p class="lead-src">Source: ${esc(s.source)}</p>
      </article>`).join("")}</div>` : `<p class="empty">Not enough data is loaded for this state to suggest leads.</p>`}
    ${leads.length && leads.length < 3 ? `<p class="meta">Only ${leads.length} lead(s) can be supported by the data loaded for this state. See Data details for why.</p>` : ""}`;

  // Data details: exact sources for findings and each lead, plus skipped rules.
  const m = currentMeasure();
  const rows = [];
  if (!kf.atlas.missing && m) rows.push(["Credit finding", `Opportunity Atlas file ${m.sourceFile}, ${describeMeasure(m)}, by county. Compared with the median of all counties in the state with a value.`]);
  if (!kf.cfpb.missing && app.cfpbState) {
    const top = groupPairs(app.cfpbState.rows)[0];
    rows.push(["Complaint finding", `CFPB Consumer Complaint Database: State = ${app.cfpbState.state} (the consumer's mailing address), Product = "${top.p}", Issue = "${top.i}", Date received ${app.cfpbState.dateMin} to ${app.cfpbState.dateMax}.`]);
  }
  leads.forEach((s, i) => rows.push([`Hypothesis ${i + 1}`, `${s.fields} Method: ${s.method}`]));
  $("sources").innerHTML = rows.length ? `<dl class="src-list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : `<p class="empty">Nothing loaded for this state.</p>`;
  const unused = signals.filter((s) => !leads.includes(s));
  $("skipped").innerHTML = `${unused.length ? `<p class="meta">Other leads available for this state but not shown: ${unused.map((s) => esc(s.hypothesis)).join(" · ")}</p>` : ""}
    ${skipped.length ? `<p class="meta">Rules that couldn't run here:</p><ul class="meta">${skipped.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}`;
}

// ---------- Measure + group choice ----------
// Atlas files can split one measure into groups (e.g. kid_race, par_pctile).
const baseOf = (m) => m.base || m.key;
function natSort(a, b) { const x = Number(a), y = Number(b); return Number.isFinite(x) && Number.isFinite(y) ? x - y : String(a).localeCompare(String(b)); }
function groupScore(dim, val) {
  const v = String(val).toLowerCase();
  if (/race|sex|gender/i.test(dim)) return /pool|all|total|^p$/.test(v) ? 0 : 1; // prefer everyone combined
  if (/pctile|rank|quintile|^par_q/i.test(dim)) { const n = Number(v); return Number.isFinite(n) ? Math.abs(n - 25) : 1; } // prefer lower-income (25th pct.)
  return 0;
}
function pickDefault(b) {
  const list = (app.atlasIndex?.measures || []).filter((m) => baseOf(m) === b);
  const score = (m) => Object.entries(m.groups || {}).reduce((s, [d, v]) => s + groupScore(d, v), 0);
  return [...list].sort((a, c) => score(a) - score(c))[0]?.key || null;
}
function switchGroup(dim, val) {
  const cur = currentMeasure();
  const list = app.atlasIndex.measures.filter((m) => baseOf(m) === baseOf(cur) && String(m.groups?.[dim]) === String(val));
  const same = (m) => Object.entries(cur.groups || {}).filter(([d, v]) => d !== dim && String(m.groups?.[d]) === String(v)).length;
  app.measureKey = [...list].sort((a, b) => same(b) - same(a))[0]?.key || app.measureKey;
}

function renderAtlasControls() {
  const ms = app.atlasIndex?.measures || [];
  if (!ms.length) return;
  const cur = currentMeasure();
  const bases = [];
  for (const m of ms) if (!bases.some((b) => b.base === baseOf(m))) bases.push({ base: baseOf(m), label: m.label, column: m.column });
  const options = bases.map((b) => `<option value="${esc(b.base)}"${b.base === baseOf(cur) ? " selected" : ""}>${esc(b.label)} — ${esc(b.column)}</option>`).join("");
  const dims = Object.keys(cur?.groups || {});
  const groupSelects = dims.map((d) => {
    const vals = [...new Set(ms.filter((m) => baseOf(m) === baseOf(cur)).map((m) => m.groups?.[d]))].sort(natSort);
    return `<label class="group-sel"><span class="field-label">${esc(d)}</span><select data-dim="${esc(d)}">${vals.map((v) => `<option${String(v) === String(cur.groups[d]) ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
  }).join("");
  $("atlas-controls").innerHTML = `
    <label class="field-label" for="measure-select">Measure</label>
    <select id="measure-select">${options}</select>
    ${dims.length ? `<div class="groups">${groupSelects}</div>` : ""}
    <p class="meta">${esc(describeMeasure(cur))}. File: <code>${esc(cur?.sourceFile)}</code>.${dims.length ? ` Now showing: ${esc(plainGroup(cur))}. Group codes are shown exactly as in the file — see <code>credit_codebook.pdf</code> for what each means.` : ""}</p>`;
  const rerender = () => { renderSummary(); renderAtlasControls(); renderAtlasTable(); renderAi(); };
  $("measure-select").addEventListener("change", (e) => { app.measureKey = pickDefault(e.target.value); rerender(); });
  $("atlas-controls").querySelectorAll("select[data-dim]").forEach((el) => el.addEventListener("change", () => { switchGroup(el.dataset.dim, el.value); rerender(); }));
}

// ---------- Full county table ----------
function renderAtlasTable() {
  const body = $("atlas-body");
  if (!app.atlasState) { body.innerHTML = `<p class="empty">No credit data for this state.</p>`; return; }
  const m = currentMeasure();
  const vals = measureValues(app.atlasState, app.measureKey);
  const dir = m?.higherIsBetter;
  vals.sort((a, b) => (dir === false ? b.v - a.v : a.v - b.v));
  const lo = Math.min(...vals.map((d) => d.v)), hi = Math.max(...vals.map((d) => d.v));
  const pos = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  const missing = app.atlasState.counties.length - vals.length;
  body.innerHTML = vals.length ? `${DEMO()}
    <p class="meta">${dir === true ? "Higher is better; weakest first." : dir === false ? "Lower is better; weakest (highest) first." : "Sorted lowest to highest."} Values exactly as in the file.</p>
    <div class="scale" aria-hidden="true"><span>${fmt(lo)}</span><span>county range in this state</span><span>${fmt(hi)}</span></div>
    <div class="table-wrap"><table class="data atlas-table">
      <thead><tr><th>#</th><th>County</th><th class="dotcol">Position</th><th class="num">Value</th>${m?.hasSE ? `<th class="num">SE</th>` : ""}${m?.hasN ? `<th class="num">n</th>` : ""}</tr></thead>
      <tbody>${vals.map((d, i) => `<tr title="${esc(d.name)}: ${fmt(d.v)}">
        <td class="muted">${i + 1}</td><td>${esc(d.name)} <span class="muted fips">${esc(d.fips)}</span></td>
        <td class="dotcol"><div class="track"><span class="dot" style="left:${pos(d.v).toFixed(1)}%"></span></div></td>
        <td class="num">${fmt(d.v)}</td>${m?.hasSE ? `<td class="num muted">${fmt(d.se)}</td>` : ""}${m?.hasN ? `<td class="num muted">${d.n !== undefined ? nf(d.n) : "—"}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>
    <p class="meta">${vals.length} counties with a value${missing ? `; ${missing} have no value (blank in the source file, often because of small samples)` : ""}. The dot shows where each county sits between the state's lowest and highest county; it doesn't start at zero.</p>`
    : `<p class="empty">No county in this state has a value for this measure.</p>`;
}

// ---------- Full complaint breakdown ----------
function renderCfpb() {
  const body = $("cfpb-body");
  const c = app.cfpbState;
  if (!c) { body.innerHTML = `<p class="empty">No complaint data for this state.</p>`; return; }
  const years = [...new Set(c.rows.map((r) => r.y))].sort((a, b) => b - a);
  const yr = app.year === "all" ? null : Number(app.year);
  const prods = groupProducts(c.rows, yr);
  const total = prods.reduce((s, g) => s + g.n, 0);
  const max = prods[0]?.n || 1;
  const bar = (n, m) => `<div class="bar"><span style="width:${((n / m) * 100).toFixed(1)}%"></span></div>`;
  body.innerHTML = `${DEMO()}
    <label class="field-label" for="year-select">Year (by date received)</label>
    <select id="year-select"><option value="all">All years in file</option>${years.map((y) => `<option value="${y}"${String(y) === String(app.year) ? " selected" : ""}>${y}</option>`).join("")}</select>
    <p class="meta"><strong>${nf(total)}</strong> complaints from consumers with a ${esc(stateName(c.state))} mailing address${yr ? ` in ${yr}` : `, ${esc(c.dateMin)} to ${esc(c.dateMax)}`}, grouped by Product, then Issue. Click a product to see its issues. The first and last years may be partial.</p>
    <div class="products">${prods.slice(0, 15).map((g) => `
      <details class="product">
        <summary title="${esc(g.p)}: ${nf(g.n)}"><span class="pname">${esc(g.p)}</span>${bar(g.n, max)}<span class="num">${nf(g.n)}</span><span class="share muted">${((g.n / total) * 100).toFixed(1)}%</span></summary>
        <ul class="issues">${g.issues.slice(0, 10).map((x) => `<li title="${esc(x.i)}: ${nf(x.n)}"><span class="iname">${esc(x.i)}</span>${bar(x.n, g.issues[0].n)}<span class="num">${nf(x.n)}</span></li>`).join("")}
        ${g.issues.length > 10 ? `<li class="muted more">+ ${g.issues.length - 10} more issues (${nf(g.issues.slice(10).reduce((s, x) => s + x.n, 0))} complaints)</li>` : ""}</ul>
      </details>`).join("")}
      ${prods.length > 15 ? `<p class="muted">+ ${prods.length - 15} smaller products not shown.</p>` : ""}
    </div>`;
  $("year-select").addEventListener("change", (e) => { app.year = e.target.value; renderCfpb(); });
}

// ---------- AI Studio export ----------
function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function renderAi() {
  const lines = [];
  if (app.demo) lines.push("# DEMO DATA, NOT A REAL FINDING — made-up numbers for testing only");
  const c = app.cfpbState;
  if (c) {
    lines.push(`# TABLE A: CFPB complaint counts, state=${c.state}, date received ${c.dateMin} to ${c.dateMax}, total complaints=${c.total}. Source: CFPB Consumer Complaint Database. Not a statistical sample.`);
    lines.push("row_id,state,year,product,issue,complaint_count");
    const years = [...new Set(c.rows.map((r) => r.y))].sort();
    let id = 1;
    // top 10 product+issue groups per year keeps the prompt short
    for (const y of years) for (const r of groupPairs(c.rows, y).slice(0, 10)) lines.push([`A${id++}`, c.state, y, r.p, r.i, r.n].map(csvCell).join(","));
  }
  const m = currentMeasure();
  const vals = measureValues(app.atlasState, app.measureKey);
  if (m && vals.length) {
    lines.push("");
    lines.push(`# TABLE B: Opportunity Atlas county values, state=${app.st}, file=${m.sourceFile}, column=${m.column}${m.group ? `, group=${m.group}` : ""}, higher_is_better=${m.higherIsBetter}. Outcomes in 2020 for people born 1978-1985, by the county where they grew up.`);
    lines.push(`row_id,county_fips,county_name,value${m.hasSE ? ",se" : ""}${m.hasN ? ",n" : ""}`);
    vals.forEach((d, i) => lines.push([`B${i + 1}`, d.fips, d.name, d.v, ...(m.hasSE ? [d.se ?? ""] : []), ...(m.hasN ? [d.n ?? ""] : [])].map(csvCell).join(",")));
  }
  $("ai-text").value = lines.join("\n") || "No data loaded for this state.";
}
async function copyAi() {
  const t = $("ai-text");
  try { await navigator.clipboard.writeText(t.value); $("copy-msg").textContent = "Copied."; }
  catch { t.select(); $("copy-msg").textContent = "Press Ctrl+C (Cmd+C on Mac) to copy."; }
}

init();
