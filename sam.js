// /api/sam — server-side search of SAM.gov Contract Opportunities.
// Runs on Vercel (as a Serverless Function) and locally through `npm start`.
//
// The SAM.gov API key is read from the SAM_API_KEY environment variable and
// is only used here, on the server. It is never sent to the browser, never
// put in a URL the browser sees, and never included in error messages.
//
// API docs: https://open.gsa.gov/api/get-opportunities-public-api/
// Endpoint: https://api.sam.gov/opportunities/v2/search
//
// Limits: SAM.gov caps requests per key per day (the cap depends on your
// SAM.gov role and isn't published on the docs page). To stay well under it:
//   - every search is cached for 24 hours (in memory and on Vercel's CDN),
//   - each search makes at most 2 calls to SAM.gov,
//   - this function stops calling SAM.gov after SAM_DAILY_CALL_LIMIT calls per
//     day (default 10) on each server instance,
//   - nothing is fetched until a visitor presses Search.

import { SAM_TOPICS, POSTED_WINDOWS, OPEN_NOTICE_TYPES, titleMatch, KEYWORD_RE } from "../lib/samTopics.js";
import { STATES } from "../lib/states.js";

const API_URL = "https://api.sam.gov/opportunities/v2/search";
const CACHE_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 500; // records per SAM.gov call (max allowed is 1000)
const VALID_STATES = new Set(STATES.map((s) => s[1]));

const cache = new Map(); // key -> { at, body }
const budget = { day: "", used: 0 };

function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cacheSeconds > 0
    ? `public, max-age=300, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`
    : "no-store");
  res.end(JSON.stringify(body));
}

// Dates use U.S. Eastern time (SAM.gov is a U.S. federal system), so "today"
// doesn't jump ahead in the evening the way UTC would.
function etParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return p;
}
const samDate = (d) => { const p = etParts(d); return `${p.month}/${p.day}/${p.year}`; }; // SAM.gov wants MM/dd/yyyy
const isoDay = (d) => { const p = etParts(d); return `${p.year}-${p.month}-${p.day}`; };

function dailyLimit() {
  const n = Number(process.env.SAM_DAILY_CALL_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 10;
}
function takeBudget(calls) {
  const today = isoDay(new Date());
  if (budget.day !== today) { budget.day = today; budget.used = 0; }
  if (budget.used + calls > dailyLimit()) return false;
  budget.used += calls;
  return true;
}

// Keep only official fields the page shows. Contact names, emails and phone
// numbers (pointOfContact) are deliberately dropped.
function slim(r) {
  const pop = r.placeOfPerformance || {};
  const name = (x) => (x && typeof x === "object" ? x.name || x.code || "" : x || "");
  return {
    noticeId: r.noticeId,
    title: r.title || "",
    solicitationNumber: r.solicitationNumber || "",
    agencyPath: r.fullParentPathName || [r.department, r.subTier, r.office].filter(Boolean).join("."),
    type: r.type || "",
    baseType: r.baseType || "",
    postedDate: r.postedDate || "",
    responseDeadLine: r.responseDeadLine || r.reponseDeadLine || null,
    active: r.active || "",
    naicsCode: r.naicsCode || "",
    setAside: r.typeOfSetAsideDescription || "",
    place: {
      city: name(pop.city),
      state: (pop.state && (pop.state.code || pop.state.name)) || "",
      stateName: (pop.state && pop.state.name) || "",
      country: name(pop.country),
    },
    link: typeof r.uiLink === "string" && /^https:\/\/sam\.gov\/opp\//.test(r.uiLink)
      ? r.uiLink
      : `https://sam.gov/opp/${encodeURIComponent(r.noticeId)}/view`,
  };
}

async function callSam({ key, title, state, from, to }) {
  const u = new URL(process.env.SAM_API_BASE || API_URL); // SAM_API_BASE is only for local testing
  u.searchParams.set("api_key", key);
  u.searchParams.set("postedFrom", samDate(from));
  u.searchParams.set("postedTo", samDate(to));
  u.searchParams.set("limit", String(PAGE_LIMIT));
  u.searchParams.set("offset", "0");
  u.searchParams.set("title", title);
  if (state) u.searchParams.set("state", state);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000); // 2 calls x 12 s stays under the 30 s limit in vercel.json
  try {
    const r = await fetch(u, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (r.status === 404) return { total: 0, records: [] }; // SAM.gov uses 404 for "no data found"
    if (r.status === 429) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error("bad_key"), { code: "bad_key" });
    if (!r.ok) throw Object.assign(new Error(`upstream_${r.status}`), { code: "upstream_error" });
    const j = await r.json();
    const records = j.opportunitiesData || [];
    return { total: Number(j.totalRecords) || records.length, records };
  } catch (e) {
    if (e.code) throw e;
    throw Object.assign(new Error("network"), { code: e.name === "AbortError" ? "timeout" : "network" });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method && req.method !== "GET") return send(res, 405, { error: "method_not_allowed" });
  const q = new URL(req.url, "http://local").searchParams;
  const key = (process.env.SAM_API_KEY || "").trim();

  // Cheap status check: tells the page whether a key is set. Never calls SAM.gov.
  if (q.get("mode") === "status") return send(res, 200, { configured: Boolean(key) }, 60);
  if (!key) return send(res, 503, { error: "not_configured" });

  // --- Validate inputs (only these values are ever passed to SAM.gov) ---
  const topicId = q.get("topic") || "";
  const keyword = (q.get("q") || "").trim().replace(/\s+/g, " ");
  const state = (q.get("state") || "").toUpperCase();
  const days = Number(q.get("days") || 90);
  let titles, terms, label;
  if (topicId) {
    const t = SAM_TOPICS[topicId];
    if (!t) return send(res, 400, { error: "bad_topic" });
    ({ queries: titles, terms, label } = t);
  } else if (keyword) {
    if (!KEYWORD_RE.test(keyword)) return send(res, 400, { error: "bad_keyword" });
    titles = [keyword]; terms = [keyword]; label = `Keyword: ${keyword}`;
  } else return send(res, 400, { error: "missing_search" });
  if (state && !VALID_STATES.has(state)) return send(res, 400, { error: "bad_state" });
  if (!POSTED_WINDOWS.includes(days)) return send(res, 400, { error: "bad_days" });

  // --- Cache ---
  const to = new Date();
  const from = new Date(to.getTime() - (days === 365 ? 364 : days) * 86400000); // stay inside SAM.gov's 1-year limit
  const cacheKey = JSON.stringify([topicId || keyword.toLowerCase(), state, days, isoDay(to)]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, { ...hit.body, cached: true }, 86400);

  if (!takeBudget(titles.length)) return send(res, 429, { error: "daily_budget_used", limit: dailyLimit() });

  // --- Fetch from SAM.gov ---
  try {
    const byId = new Map();
    const upstream = [];
    for (const title of titles) {
      const { total, records } = await callSam({ key, title, state, from, to });
      upstream.push({ title, total, returned: records.length });
      for (const r of records) if (r && r.noticeId && !byId.has(r.noticeId)) byId.set(r.noticeId, r);
    }
    const all = [...byId.values()].map(slim);
    const open = all.filter((r) => r.active === "Yes" && OPEN_NOTICE_TYPES.includes(r.type));
    const results = open
      .map((r) => ({ ...r, match: titleMatch(r.title, terms) }))
      .sort((a, b) => String(b.postedDate).localeCompare(String(a.postedDate)));
    const body = {
      source: "SAM.gov Contract Opportunities API (api.sam.gov/opportunities/v2/search)",
      search: { label, topic: topicId || null, keyword: topicId ? null : keyword, titleQueries: titles, terms, state: state || null, postedFrom: isoDay(from), postedTo: isoDay(to) },
      upstream, // how many records SAM.gov reported vs. returned for each query
      retrievedAt: new Date().toISOString(),
      excluded: all.length - open.length, // archived, award notices, justifications, surplus sales
      results,
    };
    cache.set(cacheKey, { at: Date.now(), body });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return send(res, 200, { ...body, cached: false }, 86400);
  } catch (e) {
    const code = e.code || "upstream_error";
    const status = code === "rate_limited" ? 429 : code === "bad_key" ? 502 : 502;
    return send(res, status, { error: code }, code === "rate_limited" ? 600 : 0);
  }
}
