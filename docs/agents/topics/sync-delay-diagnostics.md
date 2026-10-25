# Sync-delay diagnostics

Status: canonical runbook

Use this when an attack/expansion shows a sync-delay warning or players report
repeated reconnects. The rewrite gateway and simulation are the runtime.

## Collect and interpret

Download the debug log while the incident is recent. Schema v2 includes:

- `capturedAt` for the client snapshot and `generatedAt` after server collection.
- `clientBuildSha`, plus `serverBundle.body.serverBuildSha` and
  `serverStartedAt` to identify a deployment/restart.
- `commandTimings`: actual socket-send to queued/accepted response elapsed time,
  acceptance-handler duration, server receipt to acceptance-send duration,
  and persistence/simulation-submit stages, joined by `commandId`.
- `syncDiagnostics`: visibility, online status, bounded main-thread long tasks,
  monotonic clock origin and transport counters. `bufferedAmount`, channel and
  socket generation are captured in wire events. A successful `send` means
  the browser accepted bytes, not that they reached the server.
- `performanceMetrics`: existing frame/terrain/heap measurements.
- `incidents`: the latest 20 warning windows (80 preceding and up to 40 following
  debug events within 15 seconds), plus session timeout and eviction counters.
- `disconnectHistory`: up to 25 persisted close/error records with close codes,
  reasons, cleanliness and connection uptime, including earlier page loads.

`queue-dispatch` is a local queue decision, not a socket send. A muster attack
can wait for troop travel. `muster-transit-armed` records planned travel and
`muster-transit-ready` records timer lateness. Use `wire-sent` for network timing.
`wire-received` is recorded before messages wait behind INIT assembly;
`wire-applied` is recorded after synchronous client message handlers finish.

Client command durations use `performance.now()`. Server event timestamps use
its own wall clock. Do not subtract client and server timestamps to estimate
one-way network latency. Send-to-queued time includes gateway persistence;
it is not a pure network ping. A missing timing is unknown, never zero.

## Server collection and limits

The player export uses `GET /api/player/sync-diagnostics` with the existing
Firebase ID token as a bearer credential. Identity comes from verified auth,
not a query parameter. Only that player's command events and whitelisted scalar
diagnostic fields are returned. Tokens, auth email, raw errors, snapshots and
opponents' combat details are excluded. The response is `Cache-Control: no-store`.
The full `/admin/runtime/debug-bundle` remains admin-only.

The gateway keeps an independent diagnostic journal for explicitly observed
client ATTACK/EXPAND commands: at most 200 commands, 24 events each, for 30
minutes. Routine AI/automation traffic cannot enter it. The client requests the
command IDs of its preserved warning windows (up to 20), so later traffic cannot
crowd those traces out of the response while they remain in the journal. The
endpoint returns up to 480 incident events plus 200 recent non-incident events
(680 total). Requested IDs are filtered by authenticated ownership before
selection; they cannot fetch another player's traces. ID caps and event counts
are exported. Journal counts/evictions are exported; restart clears the
journal. Gateway event-loop window max and the latest cached simulation backlog
are sampled with frontier stages. These are context, not a CPU stack trace.
Collection-time Prometheus samples are separately labeled `metricsAt`.

Browser long-task support varies; check `longTaskSupported`. At most 120 tasks
are retained and eviction is counted. Tasks of at least 100ms also enter the
incident event stream. Background throttling, browser pauses and messages still
in network transit cannot always be separated by browser observations alone.

`serverBundle.ok: false` means collection failed or no signed-in user was
available. Client evidence still downloads. Token acquisition and HTTP each
have a four-second limit. Bug and respawn reports reuse this player-scoped
collection path. Local direct-player auth without Firebase has client evidence
only. No full server admin bundle is exposed to fix a 401.

To confirm a restart/crash/deployment, correlate the build and startup time with
historical logs using [the deploy runbook](../deploys.md). Client-only evidence
cannot prove why a process restarted. Simulation submit RPC completion acknowledges
queueing, not necessarily gameplay completion. The subsequent simulation-event
receipt and outgoing payload stages bound the wait for the runtime reply. A gap
there can include simulation queueing/processing or event-stream delivery; exact
simulation phases/database waits still require server-side profiling/logs.

## Entry points and focused checks

- `packages/client/src/client-debug-bundle/`: export and authenticated fetch.
- `packages/client/src/client-sync-diagnostics/`: wire/environment timing.
- `packages/client/src/client-debug/client-debug-incidents.ts`: incident retention.
- `apps/realtime-gateway/src/player-sync-diagnostics/`: player-safe route/journal.
- `apps/realtime-gateway/src/frontier-submit/`: persistence and RPC stages.

```bash
pnpm --filter @border-empires/client exec vitest run src/client-debug-bundle src/client-sync-diagnostics src/client-debug/client-debug-incidents.test.ts src/client-multiplex-websocket src/client-muster-transit
pnpm --filter @border-empires/realtime-gateway exec vitest run src/player-sync-diagnostics src/frontier-submit src/http-routes/http-routes.test.ts
```
