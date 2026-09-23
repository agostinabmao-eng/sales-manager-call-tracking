// One-time import of existing data from the old Supabase project into DATABASE_URL.
// Safe to re-run: rows are upserted by key.
const { Pool } = require('pg');

const SB_URL = process.env.SUPABASE_URL || 'https://lqnmkrrirhbtsywoxzve.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_L2mMtUYcew6hhMWXsTU0OQ_hFdJyvkN';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const res = await fetch(SB_URL + '/rest/v1/app_data?select=key,value,updated_at', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error(`Supabase responded ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  console.log(`Fetched ${rows.length} rows from Supabase`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const row of rows) {
    await pool.query(
      `INSERT INTO app_data (key, value, updated_at) VALUES ($1, $2, COALESCE($3::timestamptz, now()))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [row.key, JSON.stringify(row.value), row.updated_at || null]
    );
  }
  await pool.end();
  console.log(`Imported ${rows.length} rows`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
