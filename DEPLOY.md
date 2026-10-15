# Recommended: private live demo on Render

The app is prepared for a single Render web service with persistent storage and password protection. It is not deployed until Render provides an HTTPS URL and we verify that URL.

1. Sign into Render and connect GitHub.
2. Choose **New → Blueprint**, select `tmoran5973/codextesting`, and use `render.yaml` on the `main` branch.
3. Review Render's displayed hosting and disk charges before creating resources. The Blueprint requests a Starter service and a 1 GB persistent disk. An ephemeral free service would lose local artwork and project records on redeployment.
4. Deploy. In the service's **Environment** settings, reveal the generated `DEMO_PASSWORD` privately. The login username is **studio**. Never paste the password in chat.
5. Open the HTTPS URL Render assigns and sign in. You can explore and create book projects immediately without an AI key.
6. To generate artwork, open **API settings** inside the app and save your separately billed OpenAI API key. No redeployment is needed. Alternatively supply `COLORING_API_KEY` through Render environment settings. Never put the key in GitHub or chat. App-saved keys are encrypted with your login password; changing that password requires re-entering the API key.
7. Start with one sample page. Check generation, visual review, and one repair before running a whole book.

Verification: `/healthz` should return `{"ok":true}` without login; the main app, project API, and artwork must require login. Create a project, restart the service, and confirm it is retained. Set provider-side spending controls in addition to the app's estimated reservations.

Keep one instance only. The shared-password demo is for you and your wife, not a public multi-user product. Back up persistent storage before replacing or deleting the service. Publishing a Codex environment does not deploy this web service. Keep the browser tab open during batch production: it schedules one page at a time; closing it stops scheduling after the current request. No automatic image-generation retries occur.

# Alternative: Vercel + Neon

Vercel configuration is also included. Import the repository into Vercel with framework preset **Other**, then connect a Neon Postgres database through Vercel's integrations/Marketplace. Set `DATABASE_URL` to the database connection string, `DEMO_PASSWORD` to a strong password of at least 16 characters, `NODE_ENV=production`, and optionally `COLORING_API_KEY`. Use Node.js 24 and enable function settings that support the configured 300-second maximum duration. `vercel.json` routes requests through `api/index.js`.

The database stores project records, job leases, and PNG data for the pilot; larger production libraries should move images to object storage. A database lease prevents overlapping jobs and expires after interrupted invocations. Vercel processes one page per request with bounded API timeouts. Actual hosting, duration, database capacity, and API access must be validated on the deployed account; they are not verified locally. Review each provider's charges before enabling resources. Local tests use file storage, so the Neon path requires a separate integration check with a provisioned database.


For a temporary Render Free demo, omit the disk and set `DATA_DIR=/tmp/coloring-studio`. Project files and app-saved API keys can be erased on restart or redeployment. The paid Blueprint above is not required to explore the interface.
