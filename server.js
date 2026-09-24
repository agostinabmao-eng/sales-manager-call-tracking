const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const MAX_BODY = 1024 * 1024; // 1 MB

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const INDEX = fs.readFileSync(path.join(__dirname, 'index.html'));

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, db: dbReady });
  }

  if (url.pathname === '/api/data') {
    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT key, value FROM app_data');
      return sendJson(res, 200, rows);
    }
    if (req.method === 'POST') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch (e) {
        if (e.status) return sendJson(res, e.status, { error: e.message });
        return sendJson(res, 400, { error: 'Invalid JSON' });
      }
      const { key, value } = payload || {};
      if (typeof key !== 'string' || !key || value === undefined) {
        return sendJson(res, 400, { error: 'key (string) and value are required' });
      }
      await pool.query(
        `INSERT INTO app_data (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)]
      );
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // Everything else serves the single-page app (same as the old Vercel rewrite)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(INDEX);
}

let dbReady = false;

// Keep retrying so a slow or misconfigured database shows up in the logs
// instead of crashing the container.
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_data (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    dbReady = true;
    console.log('Database ready');
  } catch (err) {
    console.error(`Database not reachable (${err.code || ''} ${err.message}). Retrying in 5s...`);
    setTimeout(initDb, 5000);
  }
}

pool.on('error', err => console.error('Postgres pool error:', err.message));

http.createServer((req, res) => {
  if (!dbReady && req.url.startsWith('/api/')) {
    return sendJson(res, 503, { error: 'Database not ready' });
  }
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
  });
}).listen(PORT, '0.0.0.0', () => console.log(`Listening on port ${PORT}`));

initDb();
