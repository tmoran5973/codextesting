# Coloring Studio

A first version of a supervised coloring-book production app. Everything in the artwork workflow stays in one interface: book brief → sample generation → visual quality review → human approval → remaining pages → targeted revisions.

## Run

Requires Node.js 22 or newer. Run `npm ci` to install the locked dependencies.

```sh
cd /workspace/codextesting
npm ci
npm start
```

The server uses port 3000 and binds to `127.0.0.1`. Local development has no login unless DEMO_PASSWORD is set. Production requires password protection; see DEPLOY.md before hosting it.

To enable paid AI operations, open **API settings** in the app and save your OpenAI API key. Set a login password of at least 16 characters first. Alternatively, supply `COLORING_API_KEY` in hosting environment settings or a local ignored `.env` file. Never commit the key. Uses `gpt-image-1` for portrait medium-quality images and edits, and `gpt-4.1-mini` for structured visual reviews. Your account needs access and sufficient API credit. ChatGPT Plus does not pay for these calls.

Create a project with one page idea per line. Generate and approve the first sample before running the rest. Quality checks are advisory; only you can approve artwork. Revisions use the previous image as input, preserve version history, and stop after three revisions per page. Failed quality checks can be retried without generating the image again.

## Spending and persistence

Each request first reserves a configurable amount from the project's allowance. Default reservations are $0.50 per image request and $0.05 per quality check. **These are configurable planning amounts, not verified prices or actual billing measurements.** They do not guarantee an upper bound on provider charges. Set appropriate provider-side spending controls and reconcile actual API billing. Failed calls retain reservations because they may have incurred charges. There are no automatic API retries.

Projects, usage records where returned, and images persist in ignored `.data/`. Back up this directory if needed. It contains your artwork and briefs; deleting it deletes local projects. Processes do not survive environment publication; rerun `npm start`. Interrupted jobs are recognized on the next request. Only one job runs at a time. Keep the browser tab open to schedule successive pages in a batch.

## Validation

```sh
npm test
```

Offline tests cover budget enforcement, input validation, password protection, HTTPS origin checks, and persistence across a real server restart. Live image creation, image editing, and AI quality reviews require credentials and are not claimed as verified without a paid integration run.

## Scope

Implemented: project workspace, sample approval gate, generation, visual review, manual approval, targeted image edits, revision history, PNG downloads, budget reservations, persistent storage.

Not yet implemented: automated research, AI page planning, autonomous repair loops, PDF assembly, listing images, colored previews, video, Etsy integration, multi-user authentication, or actual invoice reconciliation. The initial goal is to measure whether the generate/review/repair loop saves editing time before building the remaining production stages.

## Online demo deployment

See [DEPLOY.md](DEPLOY.md). `render.yaml` defines a password-protected, single-instance service with persistent storage. Production refuses to start without a `DEMO_PASSWORD` of at least 16 characters. Browser login username: `studio`. `DATA_DIR` configures the storage directory. `/healthz` is public but contains no project data. A host must supply HTTPS; the app listens on the platform's `PORT` and production binds to `0.0.0.0`.


## API key settings

The authenticated **API settings** panel adds, replaces, and removes a key without restarting. A saved key overrides `COLORING_API_KEY`; removing it restores the environment key if present. The server returns presence/source metadata only, never the key. Saving does not call OpenAI or validate API permissions. The input is masked and cleared after submission or closing the panel; no credential is stored in browser storage.

App-saved keys use AES-256-GCM encryption with a key derived from `DEMO_PASSWORD` using scrypt. They are stored separately from projects in `credential.json` with owner-only file permissions (or a separate database table). Changing the login password requires entering the API key again. Anyone with the shared app login can change the key or initiate paid operations. On Render Free, saved credentials may disappear along with other temporary files when the service restarts or redeploys. Use environment configuration or persistent storage if retention is required.
