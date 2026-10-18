// Rebel One Initial Project — dashboard logic (plain JavaScript, no framework).
// Loads the small JSON files made by the prep scripts and draws the page.

import { stateName } from "./lib/states.js";
import { buildSignals, groupProducts, groupPairs, measureValues, describeMeasure, fmt } from "./lib/signals.js";

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
  const states = new Set([...(app.atlasIndex?.states || []).map((s) => s.state), ...(app.cfpbIndex?.states || []).map((s) => s.state)]);
  if (!states.size) return; // waiting for data
  const both = [...states].filter((s) => app.atlasIndex?.states.some((x) => x.state === s) && app.cfpbIndex?.states.some((x) => x.state === s));
  const sorted = [...states].sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const sel = $("state-select");
  sel.innerHTML = sorted.map((s) => {
    const a = app.atlasIndex?.states.some((x) => x.state === s), c = app.cfpbIndex?.states.some((x) => x.state === s);
    const note = a && c ? "" : a ? " (Atlas only)" : " (CFPB only)";
    return `<option value="${esc(s)}">${esc(stateName(s))}${note}</option>`;
  }).join("");
  const wanted = params.get("state");
  sel.value = sorted.includes(wanted) ? wanted : (both.sort((a, b) => stateName(a).localeCompare(stateName(b)))[0] || sorted[0]);
  sel.addEventListener("change", () => loadState(sel.value));
  const ms = app.atlasIndex?.measures || [];
  app.measureKey = ms.length ? pickDefault(baseOf(ms[0])) : null;
  for (const id of ["controls", "panels", "signals-block", "ai-block"]) $(id).hidden = false;
  $("copy-ai").addEventListener("click", copyAi);
  await loadState(sel.value);
}

function renderStatus() {
  const a = app.atlasIndex, c = app.cfpbIndex;
  const item = (name, idx, extra) => idx
    ? `<li class="ok"><strong>${name}:</strong> loaded ${extra}</li>`
    : `<li class="wait"><strong>${name}:</strong> waiting for data — follow the README to download and prepare the official file.</li>`;
  let html = `<ul class="status-list">
    ${item("Opportunity Atlas", a, a ? `(${a.states.length} states, files: ${esc(a.sourceFiles.join(", "))}; prepared ${esc(a.generated.slice(0, 10))})` : "")}
    ${item("CFPB complaints", c, c ? `(${nf(c.totalComplaints)} complaints, ${esc(c.dateMin)} to ${esc(c.dateMax)}; prepared ${esc(c.generated.slice(0, 10))})` : "")}
  </ul>`;
  if (!a && !c) {
    html = `<div class="waiting"><h2>Waiting for data</h2>
      <p>No official data has been added to this site yet, so there is nothing to show. To fill the dashboard, follow <strong>Step 3 in README.md</strong>: download the official files, run the two prep commands, and reload this page.</p>
      ${app.demo ? "" : `<p><a class="btn" href="?demo=1">Preview the layout with DEMO DATA</a> <span class="muted">(made-up numbers, clearly labeled)</span></p>`}</div>` + html;
  }
  if (app.demo) html = `<p class="demo-note">You are viewing <strong>DEMO DATA, NOT A REAL FINDING</strong>. <a href="./">Switch to real data</a>.</p>` + html;
  $("status").innerHTML = html;
  const stamp = [a && `Atlas prepared ${a.generated.slice(0, 10)}`, c && `CFPB prepared ${c.generated.slice(0, 10)}`].filter(Boolean).join(" · ");
  $("data-stamp").textContent = stamp;
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

function renderAll() { renderAtlas(); renderCfpb(); renderSignals(); renderAi(); }


// ---------- Measure + group choice ----------
// Atlas files can split one measure into groups (e.g. kid_race, par_pctile).
// The page shows one menu for the measure and one small menu per group column.
const baseOf = (m) => m.base || m.key;
function natSort(a, b) { const x = Number(a), y = Number(b); return Number.isFinite(x) && Number.isFinite(y) ? x - y : String(a).localeCompare(String(b)); }
function groupScore(dim, val) {
  const v = String(val).toLowerCase();
  if (/race|sex|gender/i.test(dim)) return /pool|all|total|^p$/.test(v) ? 0 : 1; // prefer everyone combined
  if (/pctile|rank|quintile|^par_q/i.test(dim)) { const n = Number(v); return Number.isFinite(n) ? Math.abs(n - 25) : 1; } // prefer lower-income (25th pct.)
  return 0;
}
function pickDefault(base) {
  const list = (app.atlasIndex?.measures || []).filter((m) => baseOf(m) === base);
  const score = (m) => Object.entries(m.groups || {}).reduce((s, [d, v]) => s + groupScore(d, v), 0);
  return [...list].sort((a, b) => score(a) - score(b))[0]?.key || null;
}
function switchGroup(dim, val) {
  const cur = currentMeasure();
  const list = app.atlasIndex.measures.filter((m) => baseOf(m) === baseOf(cur) && String(m.groups?.[dim]) === String(val));
  const same = (m) => Object.entries(cur.groups || {}).filter(([d, v]) => d !== dim && String(m.groups?.[d]) === String(v)).length;
  app.measureKey = [...list].sort((a, b) => same(b) - same(a))[0]?.key || app.measureKey;
}

// ---------- Atlas panel ----------
function renderAtlas() {
  const body = $("atlas-body");
  if (!app.atlasState) {
    body.innerHTML = `<p class="empty">${app.atlasIndex ? "No Atlas counties for this state in the prepared files." : "Waiting for Opportunity Atlas data (see README, Step 3a)."}</p>`;
    return;
  }
  const ms = app.atlasIndex.measures;
  const cur = currentMeasure();
  const bases = [];
  for (const m of ms) if (!bases.some((b) => b.base === baseOf(m))) bases.push({ base: baseOf(m), label: m.label, column: m.column });
  const byFile = {};
  bases.forEach((b) => (byFile[b.label] ||= []).push(b));
  const options = Object.entries(byFile).map(([label, list]) =>
    `<optgroup label="${esc(label)}">${list.map((b) => `<option value="${esc(b.base)}"${b.base === baseOf(cur) ? " selected" : ""}>${esc(b.column)}</option>`).join("")}</optgroup>`).join("");
  const dims = Object.keys(cur?.groups || {});
  const groupSelects = dims.map((d) => {
    const vals = [...new Set(ms.filter((m) => baseOf(m) === baseOf(cur)).map((m) => m.groups?.[d]))].sort(natSort);
    return `<label class="group-sel"><span class="field-label">${esc(d)}</span><select data-dim="${esc(d)}">${vals.map((v) => `<option${String(v) === String(cur.groups[d]) ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
  }).join("");
  const m = currentMeasure();
  const vals = measureValues(app.atlasState, app.measureKey);
  const dir = m?.higherIsBetter;
  vals.sort((a, b) => (dir === false ? b.v - a.v : a.v - b.v));
  const lo = Math.min(...vals.map((d) => d.v)), hi = Math.max(...vals.map((d) => d.v));
  const pos = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  const dirText = dir === true ? "Higher is better; weakest counties listed first." : dir === false ? "Lower is better; weakest (highest) counties listed first." : "Direction not set; sorted from lowest to highest.";
  const missing = app.atlasState.counties.length - vals.length;

  body.innerHTML = `${DEMO()}
    <label class="field-label" for="measure-select">Measure</label>
    <select id="measure-select">${options}</select>
    ${dims.length ? `<div class="groups">${groupSelects}</div><p class="meta">Group values are shown exactly as coded in the file — check the codebook (credit_codebook.pdf) for what each code means.</p>` : ""}
    <p class="meta">${esc(describeMeasure(m))}<br>File: <code>${esc(m?.sourceFile)}</code>. ${dirText} Values shown exactly as in the file (same units).</p>
    ${vals.length ? `
    <div class="scale" aria-hidden="true"><span>${fmt(lo)}</span><span>county range in this state</span><span>${fmt(hi)}</span></div>
    <div class="table-wrap"><table class="data atlas-table">
      <thead><tr><th>#</th><th>County</th><th class="dotcol">Position</th><th class="num">Value</th>${m?.hasSE ? `<th class="num">SE</th>` : ""}${m?.hasN ? `<th class="num">n</th>` : ""}</tr></thead>
      <tbody>${vals.map((d, i) => `<tr title="${esc(d.name)}: ${fmt(d.v)}">
        <td class="muted">${i + 1}</td><td>${esc(d.name)} <span class="muted fips">${esc(d.fips)}</span></td>
        <td class="dotcol"><div class="track"><span class="dot" style="left:${pos(d.v).toFixed(1)}%"></span></div></td>
        <td class="num">${fmt(d.v)}</td>${m?.hasSE ? `<td class="num muted">${fmt(d.se)}</td>` : ""}${m?.hasN ? `<td class="num muted">${d.n !== undefined ? nf(d.n) : "—"}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>
    <p class="meta">${vals.length} counties with a value${missing ? `; ${missing} counties have no value for this measure (blank in the source file, often because of small samples)` : ""}. The dot shows where each county sits between the state's lowest and highest county — it does not start at zero.</p>`
    : `<p class="empty">No county in this state has a value for this measure.</p>`}`;
  const rerender = () => { renderAtlas(); renderSignals(); renderAi(); };
  $("measure-select").addEventListener("change", (e) => { app.measureKey = pickDefault(e.target.value); rerender(); });
  body.querySelectorAll("select[data-dim]").forEach((el) => el.addEventListener("change", () => { switchGroup(el.dataset.dim, el.value); rerender(); }));
}

// ---------- CFPB panel ----------
function renderCfpb() {
  const body = $("cfpb-body");
  const c = app.cfpbState;
  if (!c) {
    body.innerHTML = `<p class="empty">${app.cfpbIndex ? "No CFPB complaints for this state in the prepared file." : "Waiting for CFPB complaint data (see README, Step 3b)."}</p>`;
    return;
  }
  const years = [...new Set(c.rows.map((r) => r.y))].sort((a, b) => b - a);
  const yr = app.year === "all" ? null : Number(app.year);
  const prods = groupProducts(c.rows, yr);
  const total = prods.reduce((s, g) => s + g.n, 0);
  const max = prods[0]?.n || 1;
  const bar = (n, m) => `<div class="bar"><span style="width:${((n / m) * 100).toFixed(1)}%"></span></div>`;
  body.innerHTML = `${DEMO()}
    <label class="field-label" for="year-select">Year (by date received)</label>
    <select id="year-select"><option value="all">All years in file</option>${years.map((y) => `<option value="${y}"${String(y) === String(app.year) ? " selected" : ""}>${y}</option>`).join("")}</select>
    <p class="meta"><strong>${nf(total)}</strong> complaints from consumers with a ${esc(stateName(c.state))} mailing address${yr ? ` in ${yr}` : `, ${esc(c.dateMin)} to ${esc(c.dateMax)}`}. Grouped by Product, then Issue. Click a product to see its issues. Note: the first and last years in the file may be partial.</p>
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

// ---------- Signals ----------
function renderSignals() {
  const { signals, skipped } = buildSignals({ stateLabel: stateName(app.st), atlasState: app.atlasState, measure: currentMeasure(), cfpb: app.cfpbState });
  $("signals").innerHTML = `${DEMO()}
    ${signals.length ? signals.map((s, i) => `
      <article class="signal">
        <header><span class="hyp">Hypothesis ${i + 1}</span><span class="src">${esc(s.source)}</span></header>
        <h3>${esc(s.title)}</h3>
        <dl>
          <dt>What the data shows</dt><dd>${esc(s.shows)}</dd>
          <dt>Source and fields</dt><dd>${esc(s.fields)}</dd>
          <dt>Why it might matter for economic mobility</dt><dd>${esc(s.why)}</dd>
          <dt>Question to investigate next</dt><dd>${esc(s.next)}</dd>
        </dl>
      </article>`).join("") : `<p class="empty">Not enough data loaded for this state to generate any signals.</p>`}
    ${signals.length && signals.length < 3 ? `<p class="meta">Only ${signals.length} signal(s) could be supported by the data loaded for this state.</p>` : ""}
    ${skipped.length ? `<details class="skipped"><summary>Rules that didn't produce a signal here (${skipped.length})</summary><ul>${skipped.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></details>` : ""}`;
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
