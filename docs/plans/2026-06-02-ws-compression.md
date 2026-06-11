# WebSocket wire compression (selective permessage-deflate) — 2026-06-02

> Agent hand-off. Single PR, gateway-only, env-gated. Read the whole doc.
> Inspired by the RuneScape-over-56k writeup: "compress the big infrequent
> payloads, leave the small frequent ones raw." Delta encoding and structural
> shrink are handled by other plans — this is the orthogonal wire-bytes win.

## Why

The gateway registers `@fastify/websocket` (wraps `ws` 8.19) with **no
compression** at `apps/realtime-gateway/src/gateway-app/gateway-app.ts:374`:

```ts
await app.register(websocket);
```

Every frame ships uncompressed — the ~512KB prod bootstrap, every reveal-map
chunk, every `TILE_DELTA_BATCH`. Tile JSON compresses extremely well because
every tile repeats the same key names.

This is **orthogonal** to and **multiplicative** with the two structural plans
already in flight (`2026-05-30-bootstrap-payload-shrink.md` shrinks the JSON
shape; `2026-05-30-phase-b-scale.md` PR B3 de-nests JSON strings). Compression
shrinks whatever bytes those plans leave.

## Measured numbers (real `snapshots/state.*.json`, not estimates)

Compression ratio (deflate level 6):

| Payload            | Raw    | Deflate L6 | Ratio |
|--------------------|--------|------------|-------|
| territory (tiles)  | 271KB  | 36.0KB     | 7.5×  |
| players            | 53.6KB | 9.1KB      | 5.9×  |
| economy            | 36.5KB | 4.8KB      | 7.6×  |
| **combined**       | **366KB** | **50.5KB** | **7.2×** |

CPU cost (271KB tile file, per compression):

| Level | Time   | Output | Ratio |
|-------|--------|--------|-------|
| 1     | 0.9ms  | 44.9KB | 6.0×  |
| 6     | 2.9ms  | 36.0KB | 7.5×  |
| 9     | 10.7ms | 34.8KB | 7.8×  |

**Conclusion: use level 1–6, never 9.** Level 9 costs 3–10× the CPU to shave a
few trailing KB. `ws` permessage-deflate runs zlib **async on the libuv
threadpool**, not synchronously — so this CPU does NOT block the main event
loop the way the inlining incidents (#227) did.

## Expected result

- Real 512KB prod bootstrap → **~70KB on the wire** (7.2× measured).
- Stacks with bootstrap-shrink (≈300KB → ~42KB) for **~12× total** vs today.
- Biggest felt win on slow/mobile links (transfer time dominates; decompress is
  trivial client-side).
- Also relieves the `socket.bufferedAmount > 2_000_000` reveal-stream gate at
  `gateway-app.ts:1449` — compressed chunks fill the send buffer slower.
- Per-tick deltas stay raw (below threshold): no CPU, no change. Intended.

## What this does NOT do (calibrate expectations)

- Does NOT shrink stored snapshots in SQLite — compression is wire-only.
- Does NOT reduce sim-worker CPU — the sim still serializes full JSON.
- Adds bounded gateway CPU (async) + per-socket zlib memory (the one real risk).

## The risk and the mitigation (read before coding)

`ws` permessage-deflate allocates a zlib context **per socket**. At default
settings that is up to ~300KB/connection held for the session. At 100 players
that is 20–40MB of steady-state heap — and this gateway is OOM-sensitive
(`feedback_no_ram_bumps`, `feedback_dont_starve_main_loop`, the watchdog
SIGKILL history). So defaults could trade a bandwidth win for an OOM regression.

The mitigations ARE the plan:

1. **`threshold: 1024`** — frames under 1KB skip compression. Per-tick deltas
   stay raw (no CPU, nothing lost); only bootstrap/reveal-map get deflated.
   This is the RuneScape "big-infrequent vs small-frequent" split.
2. **`serverNoContextTakeover: true`** — frees the deflate context between
   messages instead of holding it per-connection for the whole session. This is
   the single most important lever for bounding steady-state memory.
3. **`level: 6`** (or 1 if load shows CPU pressure) — never 9.
4. **`memLevel: 7`** and **`concurrencyLimit: 10`** — bound zlib working memory
   and simultaneous compressions hitting the threadpool.

## The change

**File: `apps/realtime-gateway/src/gateway-app/gateway-app.ts:374`**

`@fastify/websocket` v10 forwards `ws` server options via the `options` key.
Replace:

```ts
await app.register(websocket);
```

with:

```ts
const wsCompressionEnabled = process.env.GATEWAY_WS_COMPRESSION === "1";
await app.register(websocket, {
  options: wsCompressionEnabled
    ? {
        perMessageDeflate: {
          threshold: 1024,
          serverNoContextTakeover: true,
          clientNoContextTakeover: true,
          concurrencyLimit: 10,
          zlibDeflateOptions: { level: 6, memLevel: 7 }
        }
      }
    : {}
});
```

Default OFF. Flip via `GATEWAY_WS_COMPRESSION=1`.

Emit a startup log so we can confirm which mode is live (per
`feedback_counter_on_skip_paths` — never ship a flag with no observable signal).
Add this **on the line immediately after the `await app.register(websocket, …)`
call** — use `app.log.info` (always in scope here) NOT `recordGatewayEvent`,
which is defined later in the function and would be a use-before-define at this
point:

```ts
app.log.info({ enabled: wsCompressionEnabled }, "gateway_ws_compression_mode");
```

That is the entire code change. ~10 lines. No sim, proto, or client changes —
permessage-deflate is negotiated transparently by the browser WebSocket.

## Validation

1. **Unit/build:**
   ```bash
   pnpm --filter @border-empires/realtime-gateway test
   pnpm build:merged
   node apps/realtime-gateway/dist/realtime-gateway/src/main-merged.js &
   sleep 5 && curl -sS http://127.0.0.1:3161/healthz && kill %1
   ```

2. **Confirm negotiation** with a one-shot node client against the local
   gateway (flag ON). The handshake response must echo the extension:
   ```bash
   GATEWAY_WS_COMPRESSION=1 node apps/realtime-gateway/dist/realtime-gateway/src/main-merged.js &
   sleep 5
   node -e '
     const WebSocket=require("ws");
     const ws=new WebSocket("ws://127.0.0.1:3161/ws");
     ws.on("upgrade",(res)=>{
       console.log("extensions:",res.headers["sec-websocket-extensions"]||"(none)");
       process.exit(res.headers["sec-websocket-extensions"]?0:1);
     });'
   kill %1
   ```
   Expect `extensions: permessage-deflate; ...`. `(none)` means negotiation
   failed — the options key is wrong or the flag was not read.

3. **Load-harness gate (the important one — `feedback_tick_frequency...`,
   prod-shaped state):** run the concurrent harness from the phase-B plan at
   5→50 clients, flag OFF then ON, and compare:
   ```bash
   CONCURRENCY_LEVELS="5,10,20,30,40,50" LEVEL_DURATION_MS=60000 \
     node scripts/rewrite-concurrent-load.mjs
   ```
   Record for each run: gateway RSS, `event_loop_delay_ms` p99, and `cliffLevel`.
   **Gate: the cliff must NOT move down and RSS at 50 clients must stay within
   the prod memory envelope.** If RSS climbs, that is the per-socket zlib context
   — drop `level` to 1 and re-run before considering anything else.

## Rollout

- Ship flag OFF (no behavior change on merge).
- Flip `GATEWAY_WS_COMPRESSION=1` in **staging**, watch RSS + event-loop for a
  full session.
- Then prod, with the `2026-06-02` prod-137 playbook on standby. Watch RSS
  specifically — this is a memory change, not a CPU change.

## Self-review checklist

- [ ] Flag defaults OFF; merge is a no-op until env flips.
- [ ] `serverNoContextTakeover: true` present (the memory-bounding lever).
- [ ] `threshold` set so per-tick deltas stay raw.
- [ ] `level` is 6 (or 1), never 9.
- [ ] `gateway_ws_compression_mode` log fires at startup with `enabled`.
- [ ] Load harness run flag-OFF vs flag-ON; cliffLevel + RSS recorded in PR body.
- [ ] No sim/proto/client edits (compression is transport-layer only).
- [ ] Work done in a worktree, not the primary checkout.

## Things NOT to do

- Do not use compression level 9 — measured 3–10× the CPU for negligible gain.
- Do not drop `serverNoContextTakeover` to chase a slightly better ratio — that
  is the OOM lever.
- Do not lower `threshold` to compress per-tick deltas — they are already
  minimal and below the break-even point.
- Do not bump gateway RAM to absorb the zlib contexts — tune `level`/`memLevel`
  down instead (`feedback_no_ram_bumps`).
