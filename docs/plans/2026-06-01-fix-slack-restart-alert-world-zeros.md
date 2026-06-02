# Fix Slack restart alert showing "World 0 tiles, 0 WS" — 2026-06-01

> Agent hand-off. Single-PR, ~10 lines of code. Read all of it.

## Why

PR #460's machine-restart alert fires at the first 30-second poll
after gateway startup. At that point:

- `gateway_snapshot_tile_count.p50 = 0` — the histogram is only
  populated when an auth bootstrap records a snapshot, which hasn't
  happened yet 30s in.
- `gateway_ws_sessions = 0` — no human has connected yet.
- `gateway_cpu_percent`, RSS, GC, etc. ARE populated (sampled
  every 1s).

The user observed this twice today (post-deploy restarts at 08:42 and
08:44 UTC). Slack message read:
```
:arrows_counterclockwise: border-empires-combined *machine restart detected*
Current: uptime 30.3s
Trigger: process started 30.3s ago
World: 0 tiles, 0 human WS         ← misleading, world isn't empty
Metrics: loop_max=1ms loop_p99=2.0 gc_p99=4.4 sim_rpc_p99=0.0 cpu=4% rss=419MB
```

The "0 tiles" reads like a catastrophic failure but is just unpopulated
metrics. The alert detection is correct; only the rendered detail is
misleading.

## Fix

**Single file:** `apps/realtime-gateway/src/slack-alerts.ts`

In `buildAlertPayload`, the World line builder is around line ~130:

```ts
const worldParts: string[] = [];
if (tileCount !== undefined) worldParts.push(`${fmtCount(tileCount)} tiles`);
if (aiPlayerCount !== undefined) worldParts.push(`${fmtCount(aiPlayerCount)} AI`);
if (wsSessions !== undefined) worldParts.push(`${fmtCount(wsSessions)} human WS`);
const worldLine = worldParts.length > 0 ? worldParts.join(", ") : undefined;
```

Replace with:

```ts
const worldParts: string[] = [];
if (tileCount !== undefined && tileCount > 0) worldParts.push(`${fmtCount(tileCount)} tiles`);
if (aiPlayerCount !== undefined) worldParts.push(`${fmtCount(aiPlayerCount)} AI`);
if (wsSessions !== undefined && wsSessions > 0) worldParts.push(`${fmtCount(wsSessions)} human WS`);
const worldLine = worldParts.length > 0
  ? worldParts.join(", ")
  : "(world stats not yet populated — no auth bootstrap or WS sessions since restart)";
```

Two changes:
1. Only emit `tiles`/`human WS` parts when their values are >0.
2. When the whole line would be empty, show an explicit "not yet
   populated" message instead of dropping the line.

`aiPlayerCount` is read from a static env, so it stays in the line
even at startup — useful context.

## What NOT to do

- Don't delay the alert. 30s is the right detection latency. The
  fix is in the rendering, not the timing.
- Don't try to pre-populate `tile_count` from the SQLite store. That
  would block startup with a query for a cosmetic alert detail.
- Don't add a new metric or sample. The histogram is already correct.
- Don't add a unit test in a new file — extend the existing
  `slack-alerts.test.ts` if you want coverage.

## Tests

In `apps/realtime-gateway/src/slack-alerts.test.ts`, add one case:

```ts
it("omits World line content when tile/ws counts are zero (post-restart)", async () => {
  // ... construct alerter with tileCount=0, wsSessions=0
  // ... fire alertMachineRestart(30_000)
  // ... assert payload.blocks[1].text.text does not contain "0 tiles"
  // ... assert payload.blocks[1].text.text contains "world stats not yet populated"
});
```

## Validation

- `pnpm --filter @border-empires/realtime-gateway typecheck`
- `pnpm --filter @border-empires/realtime-gateway test`
- Deploy to staging, watch Slack channel — staging has no webhook
  set so nothing fires. Skip to prod.
- Deploy to prod — next restart alert should show "world stats not
  yet populated" instead of "0 tiles, 0 human WS".

## Self-review checklist

- [ ] Single file changed (`slack-alerts.ts`).
- [ ] Existing tests still pass.
- [ ] New test covers the zero-case.
- [ ] PR body cites this plan + observed 2026-06-01 alert text.
