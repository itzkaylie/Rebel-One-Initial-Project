# Rebel One Initial Project

A small dashboard for a business idea research challenge. It puts two official
data sources side by side:

- **Opportunity Atlas** (U.S. Census Bureau / Opportunity Insights) — county-level credit outcomes in 2020, such as average credit score and 90+ day delinquency rates, for people born 1978–1985, by the county where they **grew up**.
- **CFPB Consumer Complaint Database** — counts of complaints people filed about financial products, grouped by **state**, product, issue and year.

**Project question:** Where do the Opportunity Atlas credit outcomes suggest
financial barriers, and what financial problems do people report that might be
worth investigating?

> The two sources describe different people, places (county vs. state) and years.
> The site shows them side by side only. It never says a state complaint pattern
> happened in a specific county, or that one causes the other. Every "signal" is a
> **hypothesis to investigate**, not a finding.

---

## What's in the project

```
rebel-one-initial-project/
├── index.html            the web page
├── styles.css            how it looks
├── app.js                loads the data and draws the dashboard
├── lib/
│   ├── signals.js        the rules that generate the 3–5 hypotheses (read it!)
│   └── states.js         state FIPS codes ↔ postal codes (a fixed lookup table)
├── data/                 small files the site reads — created by the prep scripts
├── demo-data/            MADE-UP sample data (fictional "Demo State"), only shown at ?demo=1
├── raw-data/             where you put the big official downloads (never uploaded)
├── scripts/
│   ├── prepare-atlas.mjs     Atlas CSV  → data/atlas/*.json
│   ├── prepare-cfpb.mjs      CFPB CSV   → data/cfpb/*.json
│   ├── atlas-config.json     which Atlas files to read
│   ├── csv.mjs               CSV reader used by the scripts
│   ├── serve.mjs             local preview server (npm start)
│   └── upload-to-supabase.mjs  optional, see docs/supabase.md
├── docs/
│   ├── gemini-prompt.md  the Google AI Studio prompt + how to test it
│   └── supabase.md       optional Supabase setup
├── .env.example          optional settings template (Supabase only)
├── package.json          the commands below
├── .gitignore / .vercelignore
```

**Why no framework (like Next.js)?** The site is plain HTML + JavaScript. There is
nothing to install for the website itself and no build step, so it's the
simplest thing that runs on Vercel. The prep scripts use only Node.js's built-in
features, so `npm install` isn't needed either.

---

## Step 1 — Install Node.js (one time)

1. Go to https://nodejs.org and install the **LTS** version (20.6 or newer).
2. Open a terminal (Mac: *Terminal* app; Windows: *PowerShell*).
3. Check it worked: `node -v` should print a version like `v22.x.x`.

## Step 2 — Open the project and preview it

1. Unzip the project somewhere easy, e.g. your Documents folder.
2. In the terminal, go into the folder. For example:
   ```bash
   cd ~/Documents/rebel-one-initial-project
   ```
   (On Windows: `cd $HOME\Documents\rebel-one-initial-project`)
3. Start the preview:
   ```bash
   npm start
   ```
4. Open **http://localhost:3000** in your browser. You'll see **"Waiting for data"** — that's correct until you add the official files.
5. Want to see the layout first? Open **http://localhost:3000/?demo=1**. Every panel is stamped **DEMO DATA, NOT A REAL FINDING**.
6. To stop the preview, click in the terminal and press `Ctrl+C`.

> Double-clicking `index.html` won't work: browsers block pages opened from disk from loading data files. Always use `npm start`.

---

## Step 3 — Get the official data

Keep the preview stopped while you do this. Open a second terminal window if you like.

### 3a. Opportunity Atlas (county credit outcomes)

1. Go to the [Opportunity Atlas Data Tables page](https://www.census.gov/programs-surveys/ces/data/public-use-data/opportunity-atlas-data-tables.html).
2. Under **Module 1 Data Tables**, find the second table (the credit rows) and click the **csv** link for:
   - **Average Credit Score in 2020 by Race, Class, and County** → `opportunity_atlas_avg_credit_score_2020_cty.csv`
   - **Average 90+ Day Delinquency Rates in 2020 by Race, Class, and County** → `opportunity_atlas_avg_delinq_rate_2020_cty.csv`
3. Also download the **pdf** Readme in that row (`credit_codebook.pdf`). It explains every column. Keep it open.
4. Move both CSV files into the project's `raw-data/` folder. Keep the file names exactly as downloaded.
5. Run:
   ```bash
   npm run prep:atlas
   ```
6. **Check the summary it prints against the codebook.** The credit files are in "long" format: each row is one county × one group. The summary should look like this:
   ```
   county FIPS column: par_county
   state FIPS column:  par_state
   county name column: county_name
   group columns:      kid_race, par_pctile
   measure columns:    1 -> shrunk_xkid_vscore2020
   ```
   - `par_state` + `par_county` = the county where the person grew up (state and county FIPS codes).
   - `kid_race` and `par_pctile` (parents' income percentile) become two small menus under **Data details → Credit measure and group** on the dashboard. The dashboard starts on the "pooled" group and the 25th percentile if those exist.
   - The script prints the values it found for each group column. Use the codebook to learn what each code means.
   If a column is wrong, open `scripts/atlas-config.json`, type the right column names into the `columns` section, and run the command again.
7. **If it says a state file is big** (over about 8 MB), keep only the groups you need. In `scripts/atlas-config.json`, change `"keepGroupValues": {}` to, for example, `"keepGroupValues": { "par_pctile": [25, 50, 75] }`. Use values exactly as the script printed them. Then run `npm run prep:atlas` again.

Want more measures (credit card, student loan, mortgage, auto loan balances, or delinquency "controlling for income")? Download the matching **County** csv from the same table into `raw-data/` and add an entry to `files` in `scripts/atlas-config.json`, with `"higherIsBetter": true` or `false` (`false` for balances or delinquency means a higher value is treated as weaker). Leave it `null` if you aren't sure.

### 3b. CFPB complaints (state counts)

**Option A — recommended (smaller file):**
1. Go to the [CFPB Consumer Complaint Database](https://www.consumerfinance.gov/data-research/consumer-complaints/) and open the search tool.
2. Filter **Date received** to whole calendar years, e.g. **01/01/2021 to 12/31/2025** (full years make the year-over-year rules fair; the current year is still partial). Optionally filter **State** to the states you care about.
3. Use the tool's export option and choose **CSV**. Save it into `raw-data/` (e.g. `raw-data/complaints.csv`).

**Option B — everything:** on the same CFPB page, download the full dataset as CSV (a large .zip, several gigabytes once unzipped). Unzip it into `raw-data/`. The script reads it line by line, so it works, it just takes a few minutes.

Then run (change the file name if yours is different):
```bash
npm run prep:cfpb -- raw-data/complaints.csv
```
Optional date limits: `npm run prep:cfpb -- raw-data/complaints.csv --from 2021-01-01 --to 2025-12-31`
Several exports at once: `npm run prep:cfpb -- raw-data/ny.csv raw-data/ca.csv`

### Which columns the website uses

| Source | Columns read | What the site keeps |
|---|---|---|
| CFPB export | `Date received`, `Product`, `Issue`, `State` | Counts per state × year × product × issue |
| Opportunity Atlas county files | `par_state`, `par_county`, `county_name`, group columns (`kid_race`, `par_pctile`), and the value column (e.g. `shrunk_xkid_vscore2020`); also matching `_se` / `_n` columns if a file has them | One value per county per group, exactly as in the file |

Complaint narratives, company names, ZIP codes and complaint IDs are **never copied** into the site.
The cleaned files land in `data/atlas/` and `data/cfpb/` — one small JSON file per state plus an `index.json`.

### 3c. Check it

Run `npm start` again and open http://localhost:3000. Pick a state: you should see a credit finding, a complaint finding and three leads. Open **Data details** at the bottom: it should show green checkmarks with your file names and date ranges. Check a couple of numbers against the CFPB search page and the Atlas file.

---

## Step 4 — Test the Gemini prompt in Google AI Studio

See **`docs/gemini-prompt.md`**. In short: on the dashboard, open **Data details**, click **Copy data** (aggregated counts only), paste it under the prompt in AI Studio, and check every row ID Gemini cites against the dashboard.

Gemini is deliberately **not** wired into the site. A live feature would need a server function to keep the API key secret; that's more than a first version needs. **Never put a Gemini (or any) API key in `index.html`, `app.js` or any file in this project** — anyone can read browser code.

---

## Step 5 — Deploy on Vercel (get a shareable link)

The prepared files in `data/` must be included — that's what the live site reads. The big files in `raw-data/` are excluded automatically.

### Option A: GitHub + Vercel website (no command line)

1. Create a free account at https://github.com and click **New repository**. Name it `rebel-one-initial-project`. Public or private both work. Create it.
2. On the new repo page click **uploading an existing file**. Drag in everything inside the project folder **except** `raw-data` and any `.env` file (`.gitignore` only protects you when using Git itself, not drag-and-drop). Click **Commit changes**.
   - Make sure the `data` folder (with `atlas` and `cfpb` inside) was uploaded.
3. Create a free account at https://vercel.com and choose **Continue with GitHub**.
4. Click **Add New… → Project**, find your repository and click **Import**.
5. Settings: **Framework Preset: Other**. Leave Build Command and Output Directory empty. No environment variables are needed.
6. Click **Deploy**. After a few seconds you get a link like `https://rebel-one-initial-project.vercel.app`. Open it and share it.

**Updating data later:** re-run the prep commands, then upload the new `data` folder to GitHub (same "Add file → Upload files" button). Vercel redeploys automatically.

### Option B: Vercel command line

From the project folder:
```bash
npx vercel           # first time: log in, accept the defaults, creates a preview link
npx vercel --prod    # publishes the main shareable link
```
Run `npx vercel --prod` again whenever you update `data/`.

---

## Environment variables and secrets

**The website needs no environment variables.** Nothing secret is in the site.

`.env.example` lists optional values used only by `npm run supabase:upload` on your own computer:

| Variable | Used by | Secret? |
|---|---|---|
| `SUPABASE_URL` | optional Supabase upload script | Not secret, but no need to share |
| `SUPABASE_SERVICE_ROLE_KEY` | optional Supabase upload script | **SECRET — full database access** |
| `GEMINI_API_KEY` | not used in this version | **SECRET** |

> ⚠️ **Never share secret keys.** Don't paste them into website files, GitHub, chats or screenshots, and don't add them to Vercel for this version. Keep them only in a file named `.env` on your computer (already ignored by Git). If a key leaks, regenerate it in that service's dashboard right away.

## Optional — Supabase

Not needed for this version. If you want the data in a database too, follow **`docs/supabase.md`**.

---

## What the page shows

1. **One sentence** saying what the dashboard does, then the **state picker**.
2. **Two key findings:** the county with the weakest credit outcome (Opportunity Atlas, by county) and the most common complaint (CFPB, whole state).
3. **Three leads to investigate**, each labeled as a hypothesis, with what the data shows, why it could matter, and a next step.
4. **Keep in mind:** the data's limits and three checks to separate signal from noise.
5. **Where I'd look next: 211 community needs data**: a recommended next source, with links to the Alabama 211 Counts dashboard, 211 Data Pulse (and its FAQ) and the 211 New York Community Needs Assessment, their limits, and questions to bring to LoopedIn. This section is text and links only. No 211 numbers are loaded or charted, and the site never uses private caller records. Coverage was checked on Oct 29, 2026; no public 211 needs data was found for New York (the Community Needs Assessment page showed no data when checked, and 211 Data Pulse doesn't list New York).
6. **Data details** (collapsed): project question, data status, measure and group menus, exact source fields for every number, full county and complaint tables, how leads are chosen, and the Copy data box for AI Studio.

## How the leads are chosen

`lib/signals.js` makes up to five possible leads for the selected state, using only the loaded data:

1. **Fastest-growing problem**: the biggest increase between the last two complete years (only groups with ≥ 50 complaints), shown next to the state's overall change.
2. **Spread across counties**: the range of the middle half of counties and the extremes.
3. **Side by side**: the Atlas measure next to the closest-matching complaint category (e.g. credit score ↔ credit reporting, delinquency ↔ debt collection), with an explicit geography warning.
4. **Weakest counties**: the three counties with the weakest value, vs. the state's median county.
5. **Most-reported problem**: the largest product + issue group and how many complete years it was in the top 5.

The page shows the first three that the data supports, in that order, so the leads add something beyond the two key findings. Rules skip themselves when data is missing or too small, and Data details lists why. Thresholds are at the top of `lib/signals.js`.

## Troubleshooting

- **"Waiting for data" after running the prep commands** — make sure you ran them from inside the project folder and that `data/atlas/index.json` and `data/cfpb/index.json` now exist. Reload the page.
- **`prep:atlas` says a column wasn't found** — the error lists every column in the file. Put the exact names in `scripts/atlas-config.json` under `columns` (for the credit files: `"stateFips": "par_state"`, `"countyFips": "par_county"`). The current script already recognizes those names.
- **`prep:cfpb` says columns are missing** — make sure it's a CFPB complaint CSV and not the .zip; unzip first.
- **`npm start` says the port is in use** — run `PORT=3001 npm start` (Mac/Linux) or `$env:PORT=3001; npm start` (Windows PowerShell), then open http://localhost:3001.
- **The live Vercel site shows "Waiting for data"** — the `data` folder wasn't uploaded/committed. Upload it and redeploy.

## Sources

- [Opportunity Atlas Data Tables — U.S. Census Bureau](https://www.census.gov/programs-surveys/ces/data/public-use-data/opportunity-atlas-data-tables.html) (credit outcomes released 2025 with the paper "Credit Access in the United States")
- [CFPB Consumer Complaint Database](https://www.consumerfinance.gov/data-research/consumer-complaints/) — complaints are not a statistical sample of consumers' experiences.
