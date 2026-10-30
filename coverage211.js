// 211 coverage reference — copied by hand from official 211 websites.
// This file holds NO 211 counts. It only records which official 211
// dashboards exist for which states, so the site can link to them.
//
// Why links instead of imported data (checked Oct 29, 2026):
// - 211 Data Pulse: its FAQ says it can't provide downloadable data yet; it
//   mentions no API; it blocks being shown inside other sites; and its Terms
//   of Use forbid framing, copying or automatically extracting its content.
// - 211 Counts: no download or API is mentioned on its dashboard or "About the
//   data" notes, and 211counts.org now shows a bot-check page.
//
// To update: open https://211datapulse.org/partners.html, compare the list
// below, and change CHECKED_ON. Add a 211 Counts dashboard to COUNTS_211.confirmed
// only after opening it yourself.

export const CHECKED_ON = "2026-10-29";

export const DATA_PULSE = {
  name: "211 Data Pulse",
  operator: "United Way Worldwide, with participating 211 providers",
  url: "https://211datapulse.org/",
  faq: "https://211datapulse.org/faqs.html",
  partners: "https://211datapulse.org/partners.html",
  terms: "https://211datapulse.org/terms-of-use.html",
  // From the "Participating Organizations" page (state: provider, provider site).
  providers: {
    AL: ["United Way | 211 Alabama", "https://www.211connectsalabama.org/"],
    ME: ["United Ways of Maine | 211 Maine", "https://211maine.org"],
    MA: ["Mass211", "https://mass211.org"],
    NC: ["United Way of North Carolina | NC211", "https://nc211.org"],
    NJ: ["NJ 2-1-1 Partnership", "https://nj211.org/nj-211-data-dashboard"],
    PA: ["United Way of Pennsylvania | PA 211", "https://pa211.org/dashboards"],
    SD: ["Helpline Center", "https://www.helplinecenter.org/services/211-helpline/"],
    VA: ["211 Virginia", "https://211virginia.org"],
    WI: ["United Way of Wisconsin | 211 Wisconsin", "https://211wisconsin.communityos.org"],
  },
};

export const COUNTS_211 = {
  name: "211 Counts",
  operator: "Created by the Health Communication Research Laboratory at Washington University in St. Louis",
  url: "https://211counts.org/",
  // Washington University (Aug 12, 2025) says dashboards exist "for over 100
  // communities in 44 states" but doesn't list them, and the 211counts.org list
  // couldn't be opened here. Only dashboards opened directly are listed.
  confirmed: {
    AL: "https://al.211counts.org/",
  },
};

// 50 states + DC on a simple tile grid: [postal, column, row].
export const TILE_GRID = [
  ["AK", 0, 0], ["ME", 11, 0],
  ["VT", 10, 1], ["NH", 11, 1],
  ["WA", 1, 2], ["ID", 2, 2], ["MT", 3, 2], ["ND", 4, 2], ["MN", 5, 2], ["IL", 6, 2], ["WI", 7, 2], ["MI", 8, 2], ["NY", 9, 2], ["RI", 10, 2], ["MA", 11, 2],
  ["OR", 1, 3], ["NV", 2, 3], ["WY", 3, 3], ["SD", 4, 3], ["IA", 5, 3], ["IN", 6, 3], ["OH", 7, 3], ["PA", 8, 3], ["NJ", 9, 3], ["CT", 10, 3],
  ["CA", 1, 4], ["UT", 2, 4], ["CO", 3, 4], ["NE", 4, 4], ["MO", 5, 4], ["KY", 6, 4], ["WV", 7, 4], ["VA", 8, 4], ["MD", 9, 4], ["DE", 10, 4],
  ["AZ", 2, 5], ["NM", 3, 5], ["KS", 4, 5], ["AR", 5, 5], ["TN", 6, 5], ["NC", 7, 5], ["SC", 8, 5], ["DC", 9, 5],
  ["OK", 4, 6], ["LA", 5, 6], ["MS", 6, 6], ["AL", 7, 6], ["GA", 8, 6],
  ["HI", 0, 7], ["TX", 4, 7], ["FL", 9, 7],
];

export function coverage211(postal) {
  const dp = DATA_PULSE.providers[postal] || null;
  const counts = COUNTS_211.confirmed[postal] || null;
  return {
    dataPulse: dp ? { provider: dp[0], providerUrl: dp[1] } : null,
    counts: counts ? { url: counts } : null,
    any: Boolean(dp || counts),
  };
}
