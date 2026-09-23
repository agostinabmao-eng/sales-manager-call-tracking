# Vive Sales Manager – Call Tracker

Single-page app (`index.html`) served by a small Node server (`server.js`) that persists data in PostgreSQL (table `app_data`, created automatically on startup).

## Deploy on Coolify

1. **Database**: New Resource → PostgreSQL. Once it's running, copy its **internal** connection URL (`postgres://user:pass@<host>:5432/postgres`).
2. **App**: New Resource → your Git repo, branch `coolify-prod`, build pack **Dockerfile**, exposed port **3000**.
3. **Environment variables**: `DATABASE_URL=<internal postgres url>`.
4. Set the domain and deploy. Health check: `GET /health`.

### Importing existing data from Supabase (optional, one time)

The previous version stored data in a hosted Supabase project. To copy it over, open the app container's **Terminal** in Coolify and run:

```sh
npm run import:supabase
```

It upserts by key, so re-running is safe. Override the source with `SUPABASE_URL` / `SUPABASE_KEY` if needed.

## Run locally

```sh
docker run -d --name calls-db -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:16
npm install
DATABASE_URL=postgres://postgres:x@localhost:5432/postgres npm start
# open http://localhost:3000
```

## API

- `GET /api/data` → `[{ key, value }]`
- `POST /api/data` with `{ key, value }` → upsert

Note: there is no authentication; anyone with the URL can read and write. Protect it at the proxy level (e.g. Coolify basic auth) if needed.
