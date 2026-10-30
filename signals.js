// Turns the data loaded in the dashboard into 3-5 "signals" (hypotheses to
// investigate). Every number shown comes directly from the loaded files.
// Rules are simple and visible on purpose, so anyone can check them.
// If the data needed for a rule is missing or too small, the rule is skipped
// and the reason is listed instead.

export const MIN_COMPLAINTS = 50; // ignore product/issue groups smaller than this
export const MIN_COUNTIES = 5;    // need at least this many counties with a value

const PRODUCT_CONTEXT = [
  [/credit reporting/i, "Credit reports drive access to loans, rentals and sometimes jobs. Errors or disputes can block or raise the cost of credit for people trying to move up."],
  [/debt collection/i, "Debt collection problems often follow missed payments. They can add fees, damage credit records and add stress for households with thin savings."],
  [/checking|savings|bank account/i, "A working bank account is the base layer for saving, getting paid and avoiding costly alternatives like check cashers."],
  [/payday|title loan|personal loan|installment/i, "Small-dollar and short-term loans are often used by people with low credit scores; their cost and terms can make it harder to get ahead."],
  [/student loan/i, "Student loans are tied to education, one of the main mobility paths; repayment problems can cancel out some of the benefit."],
  [/mortgage/i, "Homeownership is a major way families build wealth; mortgage problems can threaten that path."],
  [/vehicle|auto|car/i, "A car loan is often how people get to work; problems can affect both credit and job access."],
  [/money transfer|virtual currency|money service/i, "Many families send or receive money between people; fees and failed transfers reduce what reaches them."],
  [/credit card|prepaid card/i, "Credit cards are a common source of everyday credit and of revolving debt that can be hard to pay down."],
];

// Which CFPB products are the closest topical match to an Atlas measure.
const MEASURE_TO_PRODUCT = [
  [/credit_score|credit score/i, /credit reporting/i, "credit reporting"],
  [/delinq/i, /debt collection/i, "debt collection"],
  [/credit_card|credit card/i, /credit card/i, "credit cards"],
  [/student/i, /student loan/i, "student loans"],
  [/mortgage/i, /mortgage/i, "mortgages"],
  [/auto|vehicle/i, /vehicle|auto/i, "vehicle loans"],
];

export function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString("en-US");
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  return v.toPrecision(3);
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const n = (x) => x.toLocaleString("en-US");

function productWhy(product) {
  const hit = PRODUCT_CONTEXT.find(([re]) => re.test(product));
  return hit ? hit[1] : "This is a financial problem people took the time to report; it may point to a barrier in how people use financial services.";
}

function median(sorted) {
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ----- CFPB helpers -----
export function completeYears(cfpb) {
  if (!cfpb?.dateMin || !cfpb?.dateMax) return [];
  const years = [];
  for (let y = Number(cfpb.dateMin.slice(0, 4)); y <= Number(cfpb.dateMax.slice(0, 4)); y++) {
    // A year counts as complete if the data start by Jan 1 and run to at least Dec 28
    // (a few quiet holiday days at the very end of December are allowed).
    if (cfpb.dateMin <= `${y}-01-01` && cfpb.dateMax >= `${y}-12-28`) years.push(y);
  }
  return years;
}

export function groupPairs(rows, year = null) {
  const m = new Map();
  for (const r of rows) {
    if (year !== null && r.y !== year) continue;
    const k = `${r.p}\t${r.i}`;
    m.set(k, (m.get(k) || 0) + r.n);
  }
  return [...m.entries()].map(([k, count]) => { const [p, i] = k.split("\t"); return { p, i, n: count }; }).sort((a, b) => b.n - a.n);
}

export function groupProducts(rows, year = null) {
  const m = new Map();
  for (const r of rows) {
    if (year !== null && r.y !== year) continue;
    if (!m.has(r.p)) m.set(r.p, { p: r.p, n: 0, issues: new Map() });
    const g = m.get(r.p);
    g.n += r.n;
    g.issues.set(r.i, (g.issues.get(r.i) || 0) + r.n);
  }
  return [...m.values()]
    .map((g) => ({ p: g.p, n: g.n, issues: [...g.issues.entries()].map(([i, c]) => ({ i, n: c })).sort((a, b) => b.n - a.n) }))
    .sort((a, b) => b.n - a.n);
}

// ----- Atlas helpers -----
export function measureValues(atlasState, key) {
  if (!atlasState || !key) return [];
  const col = atlasState.values?.[key];
  if (!col) return [];
  return atlasState.counties
    .map((c, i) => ({ fips: c.fips, name: c.name || c.fips, v: col.v[i], se: col.se?.[i] ?? undefined, n: col.n?.[i] ?? undefined }))
    .filter((c) => typeof c.v === "number");
}

export function describeMeasure(m) {
  if (!m) return "";
  return `${m.label} — column "${m.column}"${m.group ? ` (${m.group})` : ""}`;
}

// ----- Plain-language helpers -----
// "Average credit score (2020)" -> { noun: "average credit score", year: "2020" }
export function measureNoun(m) {
  const label = m?.label || m?.column || "value";
  const yr = label.match(/\((\d{4})\)\s*$/);
  // lower-case the first letter unless it starts an acronym (e.g. "DEMO")
  return { noun: label.replace(/\s*\(\d{4}\)\s*$/, "").replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase()), year: yr ? yr[1] : null };
}
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
// Describes the selected group in words, without guessing what codes mean.
export function plainGroup(m) {
  const parts = Object.entries(m?.groups || {}).map(([dim, val]) => {
    const v = String(val);
    if (/pctile|rank/i.test(dim) && /^\d+$/.test(v)) return `parents at the ${ordinal(Number(v))} income percentile`;
    if (/quintile|^par_q/i.test(dim)) return `parent income group ${v}`;
    if (/race/i.test(dim)) return /^(pooled|all|total)$/i.test(v) ? "all races combined" : `race group "${v}" (as coded in the file)`;
    if (/sex|gender/i.test(dim)) return /^(pooled|all|total)$/i.test(v) ? "all genders combined" : `group "${v}"`;
    return `${dim} "${v}"`;
  });
  return parts.join(", ");
}
export function niceDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ----- Key findings (one per source) -----
export function keyFindings({ stateLabel, atlasState, measure, cfpb }) {
  const out = { atlas: null, cfpb: null };

  const vals = measureValues(atlasState, measure?.key);
  if (measure && vals.length >= MIN_COUNTIES) {
    const { noun, year } = measureNoun(measure);
    const byValue = [...vals].sort((a, b) => a.v - b.v);
    const med = median(byValue.map((d) => d.v));
    const dir = measure.higherIsBetter;
    const when = year ? ` in ${year}` : "";
    let headline, text;
    if (dir === null) {
      headline = `${noun.replace(/^./, (c) => c.toUpperCase())} ranges from ${fmt(byValue[0].v)} to ${fmt(byValue[byValue.length - 1].v)} across counties`;
      text = `Lowest: ${byValue[0].name} (${fmt(byValue[0].v)}). Highest: ${byValue[byValue.length - 1].name} (${fmt(byValue[byValue.length - 1].v)}). The typical (median) county: ${fmt(med)}.`;
    } else {
      const w = dir === false ? byValue[byValue.length - 1] : byValue[0];
      const word = dir === false ? "highest" : "lowest";
      headline = `${word === "lowest" ? "Lowest" : "Highest"} ${noun} in ${stateLabel}: people who grew up in ${w.name}`;
      text = `People who grew up there had the ${word} ${noun}${when} of the ${vals.length} counties with data: ${fmt(w.v)}, compared with ${fmt(med)} for the typical (median) county.${dir === false ? " Here a higher number is worse." : ""}`;
    }
    out.atlas = { headline, text, group: plainGroup(measure) };
  } else {
    out.atlas = { missing: atlasState ? `Fewer than ${MIN_COUNTIES} counties in ${stateLabel} have a value for this measure.` : "No Opportunity Atlas data loaded for this state yet." };
  }

  if (cfpb?.rows?.length) {
    const top = groupPairs(cfpb.rows)[0];
    const years = completeYears(cfpb);
    let persist = "";
    if (years.length >= 2) {
      const inTop5 = years.filter((y) => groupPairs(cfpb.rows, y).slice(0, 5).some((r) => r.p === top.p && r.i === top.i));
      persist = ` It ranked in the top 5 complaint types in ${inTop5.length} of ${years.length} full years.`;
    }
    out.cfpb = {
      headline: `The most common complaint: “${top.i}”`,
      text: `${n(top.n)} of ${n(cfpb.total)} complaints (${pct(top.n / cfpb.total)}) from people in ${stateLabel} were about this, in the category “${top.p}”, from ${niceDate(cfpb.dateMin)} to ${niceDate(cfpb.dateMax)}.${persist}`,
    };
  } else out.cfpb = { missing: "No CFPB complaint data loaded for this state yet." };
  return out;
}

// ----- Leads (hypotheses) -----
export function buildSignals({ stateLabel, atlasState, measure, cfpb }) {
  const signals = [];
  const skipped = [];
  const geoNote = "Atlas numbers are by county; complaint counts are for the whole state, so this doesn't show that the complaints came from those counties.";
  const { noun } = measureNoun(measure);

  // 1. Largest product + issue group, and whether it stays near the top each year.
  if (cfpb?.rows?.length) {
    const pairs = groupPairs(cfpb.rows);
    const top = pairs[0];
    if (top && top.n >= MIN_COMPLAINTS) {
      const years = completeYears(cfpb);
      let persist = "";
      if (years.length >= 2) {
        const inTop5 = years.filter((y) => groupPairs(cfpb.rows, y).slice(0, 5).some((r) => r.p === top.p && r.i === top.i));
        persist = ` It ranked in the top 5 complaint types in ${inTop5.length} of ${years.length} full years (${years[0]}–${years[years.length - 1]}).`;
      }
      signals.push({
        id: "cfpb-top",
        source: "CFPB complaints (whole state)",
        hypothesis: `“${top.i}” may be a widespread, unsolved frustration for people in ${stateLabel}.`,
        shows: `${n(top.n)} complaints (${pct(top.n / cfpb.total)} of all ${n(cfpb.total)} from ${stateLabel}) were about this.${persist}`,
        fields: `CFPB Consumer Complaint Database: State = ${cfpb.state}, Product = "${top.p}", Issue = "${top.i}", Date received ${cfpb.dateMin} to ${cfpb.dateMax}.`,
        method: "The product + issue pair with the most complaints in the loaded date range; persistence = number of complete calendar years it was in that year's top 5.",
        why: productWhy(top.p),
        next: "Do people want this solved — do they seek help, pay for fixes or switch providers — or is it mostly a one-time dispute? Read a small sample of public complaint stories to find out.",
      });
    } else skipped.push(`Most-reported problem: the largest product + issue group has fewer than ${MIN_COMPLAINTS} complaints.`);

    // 2. Biggest increase between the last two complete years.
    const years = completeYears(cfpb);
    if (years.length >= 2) {
      const y1 = years[years.length - 1], y0 = years[years.length - 2];
      const prev = new Map(groupPairs(cfpb.rows, y0).map((r) => [`${r.p}\t${r.i}`, r.n]));
      const totalNow = cfpb.rows.filter((r) => r.y === y1).reduce((s, r) => s + r.n, 0);
      const totalPrev = cfpb.rows.filter((r) => r.y === y0).reduce((s, r) => s + r.n, 0);
      const grow = groupPairs(cfpb.rows, y1)
        .filter((r) => r.n >= MIN_COMPLAINTS)
        .map((r) => ({ ...r, before: prev.get(`${r.p}\t${r.i}`) || 0 }))
        .map((r) => ({ ...r, delta: r.n - r.before }))
        .filter((r) => r.delta > 0)
        .sort((a, b) => b.delta - a.delta)[0];
      if (grow) {
        signals.push({
          id: "cfpb-growth",
          source: "CFPB complaints (whole state)",
          hypothesis: `“${grow.i}” problems may be growing in ${stateLabel} — or more people may simply be reporting them.`,
          shows: `Complaints about this rose from ${n(grow.before)} in ${y0} to ${n(grow.n)} in ${y1} (+${n(grow.delta)}). All complaints from ${stateLabel} went from ${n(totalPrev)} to ${n(totalNow)} over the same two years.`,
          fields: `CFPB: State = ${cfpb.state}, Product = "${grow.p}", Issue = "${grow.i}", Date received year ${y0} vs ${y1}.`,
          method: `Largest increase between the last two complete calendar years, among product + issue pairs with at least ${MIN_COMPLAINTS} complaints in ${y1}.`,
          why: productWhy(grow.p) + " A rise can also come from more people using the complaint system, or CFPB relabeling categories.",
          next: `Does the increase continue into ${y1 + 1}, and is it spread across many companies or driven by one? Check the same filters on the CFPB search page.`,
        });
      } else skipped.push(`Fastest-growing problem: no product + issue group with at least ${MIN_COMPLAINTS} complaints grew from ${y0} to ${y1}.`);
    } else skipped.push("Fastest-growing problem: needs at least two complete calendar years of CFPB data.");
  } else skipped.push("Complaint leads: no CFPB data loaded for this state yet.");

  // 3 & 4. Atlas: weakest counties and spread for the selected measure.
  const vals = measureValues(atlasState, measure?.key);
  if (measure && vals.length >= MIN_COUNTIES) {
    const sorted = vals.map((d) => d.v).sort((a, b) => a - b);
    const med = median(sorted);
    const dir = measure.higherIsBetter;
    const byValue = [...vals].sort((a, b) => a.v - b.v);
    const weakest = dir === false ? byValue.slice(-3).reverse() : byValue.slice(0, 3);
    const nNote = measure.hasN ? ` Sample sizes: ${weakest.map((c) => `${c.name} ${c.n !== undefined ? n(c.n) : "n/a"}`).join(", ")}.` : "";
    const seNote = measure.hasSE ? " Standard errors are in the county table." : "";
    if (dir === null) {
      skipped.push(`Weakest counties: whether a higher "${measure.column}" is better or worse isn't set in scripts/atlas-config.json.`);
    } else {
      signals.push({
        id: "atlas-weakest",
        source: "Opportunity Atlas (by county)",
        hypothesis: `People who grew up in ${weakest.map((c) => c.name).join(", ")} may face bigger barriers to affordable credit.`,
        shows: `These counties had the weakest ${noun} of the ${vals.length} counties with data (${weakest.map((c) => fmt(c.v)).join(", ")}), compared with ${fmt(med)} for the typical county.`,
        fields: `Opportunity Atlas file ${measure.sourceFile}, ${describeMeasure(measure)}, by county FIPS.${nNote}${seNote}`,
        method: `The three counties with the ${dir === false ? "highest" : "lowest"} values of the selected measure and group; compared with the median county in the state.`,
        why: "Weaker credit outcomes for people who grew up in a place suggest barriers tied to that place, which can limit access to affordable loans, housing and emergency credit later in life.",
        next: "What do these counties have in common — rural or urban, income level, bank branches, local lenders? Compare with the Atlas county characteristics file.",
      });
    }
    const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
    signals.push({
      id: "atlas-spread",
      source: "Opportunity Atlas (by county)",
      hypothesis: `In ${stateLabel}, access to credit may depend heavily on where someone grew up, so a local or regional approach could matter.`,
      shows: `The middle half of counties ranged from ${fmt(q1)} to ${fmt(q3)} on ${noun}. The full range ran from ${fmt(sorted[0])} (${byValue[0].name}) to ${fmt(sorted[sorted.length - 1])} (${byValue[byValue.length - 1].name}).`,
      fields: `Opportunity Atlas file ${measure.sourceFile}, ${describeMeasure(measure)}; ${vals.length} counties with values.`,
      method: "Middle half = 25th to 75th percentile of county values in the state; full range = lowest and highest county.",
      why: "A wide gap inside one state suggests outcomes depend on local conditions, not only state laws.",
      next: "Is the gap still large for other income or race groups? (Change the group under Data details.)",
    });
  } else if (atlasState) {
    skipped.push(`County leads: fewer than ${MIN_COUNTIES} counties in this state have a value for the selected measure.`);
  } else skipped.push("County leads: no Opportunity Atlas data loaded for this state yet.");

  // 5. Side by side: Atlas measure next to the related complaint category.
  if (measure && vals.length >= MIN_COUNTIES && cfpb?.rows?.length) {
    const match = MEASURE_TO_PRODUCT.find(([re]) => re.test(measure.column) || re.test(measure.label));
    if (match) {
      const prods = groupProducts(cfpb.rows).filter((g) => match[1].test(g.p));
      const total = prods.reduce((s, g) => s + g.n, 0);
      if (total >= MIN_COMPLAINTS) {
        const topIssue = prods.flatMap((g) => g.issues.map((x) => ({ ...x, p: g.p }))).sort((a, b) => b.n - a.n)[0];
        const sorted = vals.map((d) => d.v).sort((a, b) => a - b);
        signals.push({
          id: "side-by-side",
          source: "Both sources, side by side",
          hypothesis: `Problems with ${match[2]}, such as “${topIssue.i}”, may be one of the barriers behind weaker credit outcomes in ${stateLabel} — this data can't confirm a link.`,
          shows: `The typical county's ${noun} was ${fmt(median(sorted))}. Separately, ${n(total)} complaints (${pct(total / cfpb.total)} of the state's total) were about ${match[2]}; the most common was “${topIssue.i}” (${n(topIssue.n)}). ${geoNote}`,
          fields: `Atlas ${measure.sourceFile} → "${measure.column}"${measure.group ? ` (${measure.group})` : ""}; CFPB Product matching "${match[2]}" (${prods.map((g) => `"${g.p}"`).join(", ")}), Issue.`,
          method: `Pairs the selected Atlas measure with the complaint category on the same topic (e.g. credit score ↔ credit reporting, delinquency ↔ debt collection). Counts are not linked by county.`,
          why: "Both sources touch the same part of financial life. Seeing them together suggests where to look, but they describe different people, places and years.",
          next: `Talk to people from the weakest counties: have they had ${match[2]} problems like “${topIssue.i}”, and what did they try to fix them?`,
        });
      } else skipped.push(`Side-by-side: fewer than ${MIN_COMPLAINTS} ${match[2]} complaints in this state.`);
    } else skipped.push(`Side-by-side: no complaint category is a clear topic match for "${measure.column}".`);
  }

  return { signals: signals.slice(0, 5), skipped };
}

// Picks three DIFFERENT leads. Prefers ones that add something beyond the two
// key findings (trend, county gap, side-by-side), then falls back to the rest.
export const LEAD_ORDER = ["cfpb-growth", "atlas-spread", "side-by-side", "atlas-weakest", "cfpb-top"];
export function pickLeads(signals, count = 3) {
  return LEAD_ORDER.map((id) => signals.find((s) => s.id === id)).filter(Boolean).slice(0, count);
}
