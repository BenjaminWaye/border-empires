# Agent Gameplay Testing (Localhost)

## Scope

How an agent can play/exercise the real rewrite stack on localhost to verify
a fix — both headless (scripted commands) and visually (the real client in a
browser). Covers login, sending commands, getting a world with real
structures to test against, and visual verification. Does not cover the
prod-shape performance gate (`docs/agents/testing-and-debugging.md`) or
deploys (`docs/agents/deploys.md`).

## Entry Points

- `apps/realtime-gateway/src/auth-identity/auth-identity.ts` (`resolveGatewayAuthIdentity`): accepts a raw player-id string as the AUTH token when `allowDirectPlayerIdToken` is set.
- `apps/realtime-gateway/src/runtime-env/runtime-env.ts:105-117`: in non-managed runtime (plain `pnpm dev`, no `GATEWAY_DEFAULT_HUMAN_PLAYER_ID` set), `defaultHumanPlayerId` already defaults to `"player-1"` — the direct-player-id-token bypass is on by default locally, no gateway config needed.
- `packages/client/src/client-app-runtime-env/client-dev-auth-bypass.ts` (`resolveDevAuthPlayerId`): client-side counterpart — `?devPlayerId=<id>` on a localhost hostname.
- `packages/client/src/client-auth-flow/client-authenticate-socket.ts`: sends the raw dev token instead of a Firebase ID token when a dev player id is resolved.
- `scripts/rewrite-local-soak.mjs`: existing non-browser WS bot — auth, build EXPAND/ATTACK candidates from world state, send, track acceptance. The best base to copy/extend for new scripted command flows.
- `scripts/ops/clone-prod-sqlite-snapshot.mjs` (`pnpm ops:prod-shape:clone-snapshot`): pulls a real prod/staging SQLite snapshot into an isolated local file via server-side `VACUUM INTO` — the way to get a world with real player structures (including yours) to test against instead of a fresh seed.
- `scripts/restart-rewrite-stack-20ai-seed.sh` (`pnpm rewrite:restart:20ai:seed`): fastest path to *some* world (fresh 20-AI seed, no real structures) when you don't need real prod state.

## Common Commands

Fresh seeded world (fast, no real structures):

```bash
pnpm rewrite:restart:20ai:seed
```

Real prod-shaped world (carries real players' structures, including yours):

```bash
pnpm ops:prod-shape:clone-snapshot   # prints the SIMULATION_SQLITE_PATH to export
SIMULATION_SQLITE_PATH=<path from output> pnpm dev
```

Headless scripted play (no browser) against either world above:

```bash
WS_URL=ws://127.0.0.1:3101/ws AUTH_TOKEN=player-1 node scripts/rewrite-local-soak.mjs
```

`AUTH_TOKEN` is any player id present in the world's DB — not necessarily
`player-1`. Useful envs: `SOAK_ITERATIONS`, `SOAK_ALLOW_ATTACKS=1`,
`SOAK_LOG_EACH_ITERATION`. See the script header for the full list.

Visual verification (real client, agent-driven browser):

1. `preview_start` with the client dev server config (port 5173).
2. `navigate` to `http://localhost:5173/?devPlayerId=<same player id>`.
3. `computer` screenshot / `read_page` / `read_console_messages` / `resize_window` as normal.

## Invariants

- The dev auth bypass only ever activates when the hostname is
  `localhost`/`127.0.0.1`/`0.0.0.0` **and** the gateway's
  `allowDirectPlayerIdToken` is set — both client and server gates must hold.
  Never wire `?devPlayerId=` handling to run against a non-local hostname.
- `clone-prod-sqlite-snapshot.mjs` only ever reads from the live app (VACUUM
  INTO on a server-side temp file, then SFTP pull) — it never writes back.
  Treat the resulting local `.db` file as disposable and never point a real
  deploy at it.
- Per [AGENTS.md](../../../AGENTS.md), a graphical/UI fix must be checked
  against **both** the 2D canvas and true-3D renderers before calling it
  verified — the visual-verification step above only exercises whichever
  renderer the browser negotiates by default; explicitly force the other one
  too (see `client-renderer-mode.ts` / `isTrue3DRendererActive()`) if the fix
  touches map rendering.

## Recent Decisions

- 2026-09-02 (PR #1749): added the `?devPlayerId=` client bypass so an agent
  can log into the real client UI on localhost without a real Firebase
  account. No gateway change was needed — the raw-player-id-token accept
  path already existed server-side and is on by default in non-managed
  (local) runtime.

## Known Pitfalls

- `pnpm ops:prod-shape:clone-snapshot` needs `flyctl` access to the source
  app; it is a real (if read-only) network operation against prod/staging,
  not purely local — don't run it reflexively for every small fix.
- The dev-auth-bypassed session still goes through the same INIT/tile-sync
  path as a real login — a world with a very large tile count can still be
  slow to open in a fresh browser tab, same as any real player.
- `AUTH_TOKEN`/`?devPlayerId=` must exactly match an existing player id in
  the loaded DB (or, for a brand-new id, the gateway will register a new
  empire under it) — a typo silently creates an extra empty player instead
  of erroring.
