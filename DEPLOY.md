# Render + Supabase: persistent demo

Keep your existing Render service. Supabase stores projects, encrypted API settings, and artwork independently of Render's temporary filesystem. Provider plan limits and project availability still apply; persistent storage is not a backup service.

## One-time Supabase setup

1. Open your chosen Supabase project (or create a dedicated project for this app).
2. Open **SQL Editor**, paste the complete contents of [`supabase/setup.sql`](supabase/setup.sql), and run it once. It creates two private tables, lease functions, and the private `coloring-studio-artwork` bucket. It does not create public access policies or delete existing projects. Run it again safely if needed.
3. Find your **Project URL** and **server-side secret key** in the project's connection/API settings. A legacy `service_role` key or a current `sb_secret_...` key is supported. Do not use an `anon` or publishable key. Never paste the secret in chat or put it in GitHub. The server-side key has broad access: use a dedicated project if possible.

## Existing Render service

In **Environment**, add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Your HTTPS project URL, e.g. `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase server-side secret key |

Keep `NODE_ENV=production` and your existing `DEMO_PASSWORD`. Remove `DATA_DIR` if you want; it is ignored when Supabase is configured. No Render disk is required. Save and deploy the latest `main` commit. Hosted deployments refuse to start without Supabase settings, and storage failures never fall back to temporary files.

Open the app, sign in, and create a test project. Refresh it, then restart/redeploy Render and confirm the project remains. Add your OpenAI key through **API settings**, generate one sample, then restart and confirm both the image and key configuration remain. Changing `DEMO_PASSWORD` requires entering the OpenAI key again because it encrypts that credential.

If the app reports unavailable storage, check Supabase is active, both variables are correct, and the SQL setup completed. Connection failures block changes rather than saving work to temporary files. Existing local-only files are not automatically imported; connect before starting new work. Already deleted Render files cannot be reconstructed from this database.

## New Render service

Use **New → Web Service**, connect `tmoran5973/codextesting`, choose `main`, Node, build `npm ci && npm test`, start `npm start`, Free instance. Set the two Supabase variables above, `NODE_ENV=production`, `NODE_VERSION=24.19.0`, and a strong `DEMO_PASSWORD` of at least 16 characters. Or use `render.yaml` as a Blueprint. Review provider plan details before enabling resources.

## Vercel alternative

`vercel.json` remains available. Use framework **Other**, Node.js 24, and the same Supabase and password settings. The configured function duration is 300 seconds; verify account limits. No Neon connection is needed. Render is the recommended path for the current demo.

## Limits and verification

This remains a single-workspace app with a shared login. Anyone with that login can change the AI key and initiate charges. Supabase tables have RLS enabled, no browser-facing policies, and functions restricted to the server role. PNGs live in a private bucket and are returned only through the authenticated app. Never make that bucket public. The app checks the bucket's visibility before using it.

Keep the browser tab open during batch production; it schedules one page at a time. A failed/interrupted API call may incur charges and is not automatically retried. Set provider-side spending controls. Back up your Supabase data separately and monitor storage/database quotas. Local adapter tests exercise the storage protocol with a test double, not your account. Live persistence must be verified after account configuration.
