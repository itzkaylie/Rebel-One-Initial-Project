# Optional: connecting Supabase

**You do not need Supabase for this version.** The website reads the small JSON
files in `data/`, which is simpler, free, and works on Vercel with no setup.
Supabase is useful later if you want to query the data with SQL, share it with
teammates, or let a future server feature read it.

These steps copy your prepared data into a Supabase database. The website keeps
reading `data/` either way.

## 1. Create a project

1. Go to https://supabase.com, sign up, and click **New project**.
2. Pick a name (e.g. `rebel-one`), set a database password (save it in a password manager), choose a region near you, and create it.

## 2. Create the tables

In your project, open **SQL Editor → New query**, paste this, and click **Run**:

```sql
create table if not exists cfpb_complaint_counts (
  id bigint generated always as identity primary key,
  state text not null,
  year int not null,
  product text not null,
  issue text not null,
  complaint_count int not null
);

create table if not exists atlas_county_values (
  id bigint generated always as identity primary key,
  county_fips text not null,
  state text not null,
  county_name text,
  source_file text,
  column_name text,
  group_label text,
  value double precision,
  se double precision,
  n double precision
);

-- Lock the tables down: with Row Level Security on and no policies,
-- only your secret service-role key can read or write them.
alter table cfpb_complaint_counts enable row level security;
alter table atlas_county_values enable row level security;
```

## 3. Add your keys to `.env` (on your computer only)

1. In Supabase: **Project Settings → API**.
2. In the project folder, copy `.env.example` to a new file named `.env`.
3. Fill in `SUPABASE_URL` (the "Project URL") and `SUPABASE_SERVICE_ROLE_KEY` (the `service_role` secret key).

> ⚠️ **The service role key is a secret.** It can read, change and delete everything
> in your database. Never paste it into `index.html`, `app.js`, a GitHub file, a
> chat, or a screenshot. `.env` is already in `.gitignore` so Git won't upload it.
> Do **not** add it to Vercel for this version — the website doesn't use it.
> If it ever leaks, go to Project Settings → API and roll (regenerate) it.

## 4. Upload

After you have run the prep commands (README Step 3):

```bash
npm run supabase:upload
```

This needs Node.js 20.6 or newer (it uses Node's built-in `--env-file` option).
If you see `.env: not found`, you haven't created the `.env` file from step 3 yet.
It clears the two tables and re-inserts all rows from `data/`. Check the result in
Supabase → **Table Editor**.

## Later: reading Supabase from the website

If you later want the website to read from Supabase instead of `data/`, add a
read-only policy for the `anon` role and use the **anon / publishable** key in
the browser — never the service role key. That change is not part of this
version.
