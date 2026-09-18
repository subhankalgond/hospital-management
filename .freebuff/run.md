# CarePulse — how to run (dev)

## Reproduce the artifacts

1. **Install dependencies** (npm, from the project root):
   ```
   npm install
   ```
2. **Env files**: none are required for local dev. `DATABASE_URL` is unset on
   purpose — `db/index.ts` falls back to an in-process PGlite database and
   auto-applies `drizzle/0000_init.sql` on first use. To develop against
   Supabase instead, copy `.env.example` to `.env.local` and fill in
   `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_ACCESS_CODE` (values live in your
   Supabase/Vercel dashboards — never commit them).
3. **Schema**: no migration step needed in dev (PGlite applies it on boot).
   For a real Postgres/Supabase database, run `npx drizzle-kit push` with
   `DATABASE_URL` set.
4. **Build artifacts**: none needed — `next dev` compiles on the fly. Do NOT
   run `npm run build` while the dev server is running; it overwrites `.next`
   and corrupts the dev server (500s on `/` until restart + `rm -rf .next`).

## Run the server

```
npm run dev -- -p 3210
```

- Port 3210 is the convention in this workspace (3000 is avoided in case
  another dev server is running there).
- Detached start (Windows, per preview recipe — stdout/stderr go to
  different files):
  ```
  powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','-p','3210' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
  ```
- Wait for `✓ Ready` in the log, then confirm `curl -s -o /dev/null -w "%{http_code}" http://localhost:3210/login` returns 200.

## Verify it works

- `GET /login` → 200 (sign-in page).
- `GET /` → 200 (redirects to `/login` when signed out; 401 on `/api/state`
  without a session cookie is expected).
- Sign up via the UI: category wizard (Patient / Doctor / Administrator —
  admin needs `ADMIN_ACCESS_CODE`, default `CAREPULSE-ADMIN-2026` locally).
- All data is served by `/api/*` routes; see `DEPLOY.md` for the Supabase +
  Vercel production setup where all devices share one database.
