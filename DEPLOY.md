# Deploying CarePulse (shared database, works from any device)

Until you finish step 5, the app runs with a **built-in local database** (per device). After step 5, all
accounts, doctors, patients and appointments live in **Supabase** and every device sees the same data.

## 1. Create the Supabase database (free)
1. Go to **supabase.com** → **Start your project** → sign up (free).
2. **New project** → name it (e.g. `carepulse`), pick a region near you, set a database password (save it).
3. When the project is ready, open **Project Settings → Database → Connection string → URI**.
4. Choose the **Connection pooler** tab (Transaction mode) and copy the URI.
   It looks like:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
5. Replace `[YOUR-PASSWORD]` with the database password you set.

## 2. Put the app on GitHub
1. Create a new **empty** repository on GitHub (no README).
2. From the project folder:

```bash
git init
git add -A
git commit -m "CarePulse with Supabase backend"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/carepulse.git
git push -u origin main
```

(If the folder is already a git repo, just add the remote and push.)

## 3. Deploy on Vercel (free)
1. Go to **vercel.com** → sign up with GitHub.
2. **Add New… → Project** → import the `carepulse` repo.
3. Before clicking Deploy, open **Environment Variables** and add all three:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the Supabase pooler URI from step 1 |
| `AUTH_SECRET` | any long random text (e.g. `openssl rand -hex 32`) |
| `ADMIN_ACCESS_CODE` | the admin signup code you want (e.g. `CAREPULSE-ADMIN-2026`) |

4. Click **Deploy** and wait ~1 minute.

## 4. Create the tables in Supabase
From your computer (one time):

```bash
# in the project folder
set DATABASE_URL=<paste the same Supabase pooler URI>      # Windows (cmd)
# or: export DATABASE_URL=<...>                            # macOS/Linux

npx drizzle-kit push
```

You should see the tables appear in Supabase → **Table Editor**.

## 5. Open it everywhere
Use the URL Vercel gives you (e.g. `https://carepulse.vercel.app`) on your phone, laptop — anywhere.
Register a doctor on one device; they appear instantly in the booking browser on every other device.

- Patients sign up directly.
- Doctors enter qualifications + license number.
- Admins need the `ADMIN_ACCESS_CODE` value you set in step 3.

## Local development
- `npm run dev` works with **no setup** (built-in local database).
- To develop against Supabase instead, create `.env.local`:
  ```
  DATABASE_URL=<pooler URI>
  ADMIN_ACCESS_CODE=CAREPULSE-ADMIN-2026
  AUTH_SECRET=<random text>
  ```

## Notes
- The admin access code is **server-side only** now — it is never shipped to the browser.
- Passwords are hashed with scrypt on the server; sessions are HTTP-only cookies.
- If you had accounts on a device before this upgrade, an admin will see an
  **“Import data found on this device”** banner after signing in — one click uploads
  those accounts into Supabase.
