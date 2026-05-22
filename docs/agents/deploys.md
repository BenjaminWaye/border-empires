# Deploys

Read this before any deploy or Vercel/Fly CLI work. AGENTS.md links here.

## Stack split (critical)

- **Staging** (`https://staging.borderempires.com`, fly app `border-empires-combined-staging`) runs the **combined rewrite stack**: `apps/realtime-gateway` + `apps/simulation` in one process, built by `Dockerfile.combined` / `fly.combined.staging.toml`.
- **Production** (fly app `border-empires`) currently runs the **legacy stack**: `packages/server`, built by `Dockerfile.server`. The rewrite is being prepared for prod but not there yet.
- "Deploy to staging" = deploying the rewrite stack. Use `pnpm deploy:staging:all` from any worktree on any branch — it fast-forwards `origin/staging` to `origin/main`, deploys the combined Fly app, then publishes the client to Vercel and flips the staging alias. Fly escape hatch: `fly deploy --config fly.combined.staging.toml --strategy rolling --remote-only`. Piecemeal split gateway/simulation staging deploys are obsolete.
- "Deploy to production" today = deploying the legacy stack to `border-empires` plus the prod client. Confirm with the user before deploying production rewrite — that's a stack-cutover operation, not a routine deploy.
- When a user says "deploy" without naming an environment, treat that as **staging by default**. Do not assume production unless the user explicitly says `production`, `prod`, or otherwise makes it unambiguous.
- Before any production deploy, make sure this checkout is updated to the latest `origin/main`.

## Vercel

- Use exactly one Vercel project: `border-empires-client` (`projectId` `prj_QczQjhdpgV6Mu8Q03r4Ot6KWD1va`, `orgId` `team_GdmtYDKeSISxfvppIgLt4Rma`).
- `pnpm vercel:link:client` from the repo root rewrites the current worktree's `.vercel/project.json` to that pinned project before any manual Vercel CLI work.
- Reserve the `staging` branch for `https://staging.borderempires.com`; `pnpm deploy:client:staging` must run from `staging` unless an explicit one-off override env var is set.
- For production client deploys: `pnpm deploy:client:prod` from the repo root. Must run from `main` and verifies the public Vercel aliases serve the new bundle without capturing the staging alias.
- Do not create or link additional Vercel projects for this repo. Reuse `border-empires-client` and prefer the stable production domain `https://border-empires-client.vercel.app/` when reporting deploy results.

## Fly

- Production app name: `border-empires`.
- Use `fly status -a border-empires`, `fly logs -a border-empires`, and `fly deploy -a border-empires` for production runtime checks and deploys.

## Deploy safety

- Treat the following as serialized — only one agent at a time: `git push origin main`, `vercel deploy --prod`, `vercel env rm`/`add`, `vercel alias set`, `fly deploy -a border-empires`, `fly secrets set`, any database migration. If you cannot guarantee you are the only agent running these, surface the deploy to the user.
- Production env vars are global mutable state. Prefer `printf '<value>' | vercel env add` over interactive prompts (avoids stray newlines), and re-read with `vercel env pull && cat .vercel/.env.production.local` to verify it round-trips clean.
- After any prod deploy, verify by hitting the live URL: confirm `wss://border-empires.fly.dev/ws` round-trips a valid handshake (`wsReadyState` reaches `1`) within 5s. A successful build is not a successful deploy.
- If a deploy fails or smoke check is red, do not roll forward by re-running. Roll back to the previous Vercel/Fly release, then investigate.
