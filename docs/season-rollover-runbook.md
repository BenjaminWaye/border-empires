# Forcing a Season Rollover (Staging / Prod)

How to force-start the next season on the combined Fly app
(`border-empires-combined-staging` or `border-empires-combined`). Season
rollover replaces the world entirely — new worldgen, new map, all current
season state (tiles, players' progress, standings) archived and wiped. This
is **not** the same as restarting the Fly machine — see
[Season rollover vs restart](#season-rollover-vs-a-plain-restart) below.

## When to use this

Use this when you need a brand-new world on staging/prod right now, without
waiting for the current season to naturally end (`currentSeasonState.status
=== "ended"`). This is what `force=true` is for — it bypasses the "has the
season actually ended" check.

## Steps

### 1. Get the admin token

`ADMIN_API_TOKEN` is a Fly secret — not in the repo, not in any dotfile.
Pull it from the running container:

```bash
flyctl ssh console -a border-empires-combined-staging -C "printenv ADMIN_API_TOKEN"
```

Swap the app name for `border-empires-combined` to target prod. Save the
printed value — the command above prints connection log lines first, then
the token on its own line at the end.

### 2. Call the rollover endpoint

```bash
TOKEN=$(flyctl ssh console -a border-empires-combined-staging -C "printenv ADMIN_API_TOKEN" 2>/dev/null | tail -1)

curl -s -X POST "https://border-empires-combined-staging.fly.dev/admin/season/start-next?force=true" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nHTTP_STATUS:%{http_code}\n"
```

A success response looks like:

```json
{"ok":true,"seasonId":"season-16"}
```

with `HTTP_STATUS:200`.

Swap the hostname for `border-empires-combined.fly.dev` to target prod.

### 3. Verify

```bash
flyctl status -a border-empires-combined-staging
```

Confirm the machine is still `started` with checks passing (rollover runs
in-process on the sim worker; it doesn't restart the machine). You can also
hit `GET /season` or `GET /hq/summary` to confirm the new `seasonId` and an
empty/fresh board.

## What `force=true` actually does

Source: `apps/simulation/src/simulation-service/simulation-service.ts`
(`startNextSeason`), reached via `POST /admin/season/start-next` in
`apps/realtime-gateway/src/http-routes/http-routes.ts`.

- Without `force`, the endpoint throws `409` ("cannot start next season
  before current season has ended") unless `currentSeasonState.status ===
  "ended"`.
- With `force=true`, that check is skipped — the current season is archived
  as `"ended"` regardless of its real status and a brand-new bootstrap
  season (fresh worldgen, fresh map, sequence + 1) replaces it immediately.
- Rejects with `409` if a rollover is already in flight
  (`seasonRolloverInFlight`), or if `SIMULATION_RULESET_ID` isn't set.
- Query param accepts `force=true`, `force=1`, or numeric `1` — anything
  else (including omitted) is treated as `false`.

## Season rollover vs. a plain restart

Restarting the Fly machine (`flyctl apps restart` / redeploy) does **not**
roll the season — the sim reloads the same persisted season's terrain from
SQLite on boot. Only `POST /admin/season/start-next?force=true` applies new
worldgen/map-style, and it **wipes current season state** (all player
progress, tiles, standings for the season being replaced). Don't reach for
a restart when the goal is a new world, and don't run the force endpoint
casually — it's destructive to whatever season is live.

## Related

- [docs/combined-stack-admin-access.md](combined-stack-admin-access.md) —
  general admin/metrics token usage on the combined stack.
