# Google AI Studio: turning complaint counts into hypotheses

**Why this is a separate step:** a live Gemini feature would need a server
function to keep the API key secret, plus error handling and cost limits. For a
first version it's faster and safer to test the prompt in Google AI Studio by
hand. The dashboard works fully without Gemini. No API key is used anywhere in
this project.

## How to use it

1. Open the dashboard and pick a state. To use a different credit measure or group, change it under **Data details → Credit measure and group**.
2. In **Data details**, scroll to **Copy data for Google AI Studio** and click **Copy data**.
3. Go to https://aistudio.google.com, sign in, and start a new chat (any current Gemini model).
4. Paste the prompt below, then paste the copied data where it says `PASTE DATA HERE`, and run it.
5. Check every hypothesis against the dashboard: each row ID it cites (A1, B3…) must exist and say what Gemini claims. Discard anything that doesn't.
6. Save good outputs in a notes doc, with the date and the data's "prepared" date from the dashboard footer.

The copied data contains only aggregated counts and county values — no complaint
narratives or personal information. If you are viewing demo data, the copied text
starts with "DEMO DATA, NOT A REAL FINDING"; don't use those results.

## The prompt (copy everything in the box)

```text
You are helping with early-stage business research about economic mobility.
You will receive two tables of aggregated, official data:

- TABLE A: CFPB Consumer Complaint Database counts for one U.S. state, grouped by year, product and issue. Each row has a row_id starting with "A".
- TABLE B: Opportunity Atlas county values for one credit measure in the same state. Each row has a row_id starting with "B". These describe people born 1978–1985 by the county where they grew up, measured in 2020.

Your task: suggest UP TO FIVE hypotheses about financial problems that might be worth investigating as possible opportunities. Fewer is fine. Zero is fine if the data doesn't support any.

Strict rules:
1. Use ONLY the data supplied below. Do not use outside facts, statistics, news, or assumptions about places or companies. If you would need outside information, say so instead of guessing.
2. For every hypothesis, cite the exact row_id(s) and field names (e.g. "A4: product, issue, complaint_count") that support it, and quote the numbers from those rows exactly.
3. If the data is insufficient (too few complaints, too few years, missing values, only one year, demo data), say "Insufficient data" and explain what is missing.
4. Do NOT claim causation. TABLE A is state-level and TABLE B is county-level; never say a complaint pattern happened in a specific county or that the Atlas values caused the complaints (or vice versa).
5. Do NOT claim the complaints are representative of all consumers. CFPB complaints are not a statistical sample.
6. Do NOT claim proven customer demand or market size. A high complaint count is not an opportunity by itself.
7. Label each item as a "Hypothesis to investigate", never as a finding or an opportunity.

For each hypothesis, use exactly this format:

Hypothesis [number]: [one sentence]
- Evidence (row_ids and fields): ...
- What the numbers show: ...
- Why it might matter for economic mobility: ...
- Limits of this evidence: ...
- Practical next validation step: [one concrete, low-cost action, e.g. "Interview 5 people who ...", "Check whether the count stays high in each of the last 3 full years", "Compare with the Atlas covariates file for these counties"]

End with a short section "What this data cannot tell us" (2–4 bullets).

DATA:
PASTE DATA HERE
```

## What to look for when testing the prompt

- **Grounding:** every number in the answer matches a row in the data you pasted.
- **Honesty:** with very little data (try a small state or one year), it should say "Insufficient data" instead of inventing patterns.
- **No overreach:** no words like "causes", "proves", "huge market", "customers want".
- **Useful next steps:** each validation step is something you could actually do this week.

If an answer breaks a rule, add a sentence to the prompt naming that mistake and rerun.
