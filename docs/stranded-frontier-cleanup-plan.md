# Stranded frontier tile cleanup

Status: active proposal
Owner: Benjamin Waye (gameplay decisions below); implementation by agent
Last verified: 2026-10-05
Replaces: none

## Problem

A FRONTIER tile is supposed to be released when it can no longer reach one of
its owner's settled tiles (or a frontier dock tile) through the owner's own
frontier tiles. That rule lives in `apps/simulation/src/encirclement/encirclement.ts`
and is **event-driven only**: `applyEncirclement` runs when a nearby tile
changes, from combat resolution, `UNCAPTURE_TILE`, and out-of-reach decay
expiry. There is no periodic sweep (the last one, removed in PR #627, blocked
the sim event loop for 9 s).

Observed on staging 2026-10-03: tile `258,40` owned by `player-1`, FRONTIER,
inside its owner's reach, not connected to any settled tile, and not decaying.
Reach protects it from out-of-reach decay, and nothing re-ran the connectivity
check after the tile it hung off was lost.

Evidence gathered so far:

1. **Paths that clear ownership without the check.** Tile shedding
   (bankrupt players, including offline ones), Aether Lance, airport
   bombardment and Create Mountain all cleared a tile's owner without calling
   `applyEncirclement`. Fixed in the same PR as this document (see Phase 0).
2. **Existing strands are never revisited.** The fix in (1) only prevents new
   strands. Tiles already stranded stay owned until something next to them
   changes.
3. **Stranded tiles can still launch actions.** The `ORIGIN_CUT_OFF` guard in
   `apps/simulation/src/runtime-frontier-command.ts` (around line 136) only fires
   when `from.frontierDecayKind === "ENCIRCLEMENT"`. Encirclement became instant
   and no longer writes that kind, so the guard is dead: a stranded tile is a
   valid EXPAND/ATTACK origin, and everything claimed from it is stranded too.
   This is the likely way strands grow.
4. **Stranded tiles count toward victory.** `controlledTiles` (SETTLED +
   FRONTIER) in
   `apps/simulation/src/season-victory-objectives/season-victory-objectives.ts`
   feeds the leader and bloc victory objective. Upkeep is unaffected (it only
   reads SETTLED tiles).
5. **The server does not know the player's viewport.** The client already sends
   `SUBSCRIBE_CHUNKS` (camera chunk + radius, throttled to ~700 ms) on camera
   moves, but the gateway drops it as an ignored legacy message
   (`apps/realtime-gateway/src/gateway-app/gateway-app.ts`, `ignoredLegacyMessageTypes`).

## Delivery status

Phases 0-3 shipped together in PR #2228, with the owner's decisions below.
Phase 4 is still conditional on Phase 3's counters. The rule itself is now
documented in `docs/game-mechanics.md` ("Frontier supply (encirclement) vs
out-of-reach decay"); archive this plan once Phase 4 is decided.

Measured cost (perf gate `stranded-frontier-perf.test.ts`, loaded dev machine):
worst-case region check (a whole 64x64 chunk of capped frontier) about 5 ms,
worst-case origin slow path (capped at 512 tiles) about 2 ms. The common origin
case is the 8-neighbour fast path.

## Proposed change

### Phase 0: close the leaking paths (in this PR)

Tile shedding, Aether Lance, airport bombardment and Create Mountain now call
`applyEncirclement` for the tile's previous owner, with regression tests in
`apps/simulation/src/runtime/runtime-encirclement-after-tile-loss.test.ts`.

### Phase 1: shared stranded-tile finder (simulation only)

- New pure function in `apps/simulation/src/encirclement/`: given seed tiles and
  an owner, return the owner's frontier tiles in that component that cannot
  reach a SETTLED or frontier-dock tile (aether bridge links count).
- Neighbor walk reads coordinates from the tile (no key re-parsing) and uses an
  index-based queue (the existing `isFrontierConnected` uses `queue.shift()`,
  which is quadratic on large components). Map lookups still build `"x,y"`
  string keys, because the runtime tile map is keyed that way.
- Hard cap on visited tiles. Hitting the cap **fails open** (releases nothing)
  and increments a counter, per the "counter on every guard" rule.
- Unit tests plus a perf test modelled on the existing encirclement perf gate.

### Phase 2: check the origin at action time (replaces the dead guard)

- On EXPAND/ATTACK from a FRONTIER origin:
  - Fast path: an 8-neighbor scan for a same-owner SETTLED or frontier-dock tile.
    If one is found, the origin is connected and the check ends.
  - Otherwise run the Phase 1 finder from the origin. If stranded, reject with
    `ORIGIN_CUT_OFF` and release the whole stranded component through the same
    clearing path `applyEncirclement` uses (ownership, auto-heal registration,
    deltas).
- Counters: stranded-origin rejections, finder cap hits.
- Perf risk: AI players issue many EXPANDs. The fast path should cover most of
  them, but per-action commands must be load-tested on prod-shaped state before
  merge (see `docs/agents/testing-and-debugging.md`).

### Phase 3: viewport-triggered cleanup

- Gateway: handle `SUBSCRIBE_CHUNKS` instead of ignoring it, and forward the
  camera's centre chunk to the sim as a low-priority system command. No client
  change is needed. The chunk is `CHUNK_SIZE` (64x64), larger than the 20x20
  originally discussed, because the client only sends its camera chunk.
- Simulation: for that region, check FRONTIER tiles of **every** owner (so an
  offline player's strands are cleaned when someone else looks at them), run the
  Phase 1 finder per owner, and release stranded components.
- Dedupe: a per-player set of already-checked chunks, cleared when the player
  subscribes again (that is, on next login). Bounded (around 256 entries per
  player), size gauged, and throttled to about one check every few seconds per
  player.
- Counters: tiles released, cache hits, throttled requests.

### Phase 4 (optional): boot sweep

Run the Phase 1 finder over every player's frontier at boot. Build it only if
Phase 3 counters show strands accumulating in areas nobody views, and only
after timing it on a prod-shape snapshot clone. Gate it to run once per release
if the measured cost is material.

### Not changing

- Out-of-reach decay (timer-based, deadline queue) is unchanged.
- No periodic world sweep is reintroduced.

## Decisions (owner, 2026-10-05)

1. Encirclement and out-of-reach decay are different rules. A cut-off tile
   decays instantly, so an action from one releases it and fails; that is the
   existing rule applied at action time, not a new restriction. A tile that is
   out of reach (decaying on a timer) but still connected must remain a valid
   origin to expand from.
2. Phase 3 checks every owner's tiles in the viewport, so a viewer never sees
   an enemy's cut-off tiles linger.
3. Deliver Phases 1-3 together.

## Acceptance criteria

- No path that clears a tile's owner leaves that owner's frontier tiles
  stranded (Phase 0).
- EXPAND/ATTACK from a stranded origin is rejected with `ORIGIN_CUT_OFF` and the
  stranded component is released (Phase 2).
- A stranded tile is released within a few seconds of any player's camera
  centering on its chunk (Phase 3). Staging tile `258,40` (or its equivalent)
  clears once viewed.
- Every new guard, cap and cache has a counter or gauge that is non-zero on
  staging under normal play.
- No measurable regression in `event_loop_blocked` or command latency on
  staging after each phase.

## Verification

- Each phase: a regression test that fails before the change and passes after,
  `pnpm ci:local`, and a client changelog entry for player-visible behavior.
- Phase 2: prod-shape load harness run before merge.
- Phase 3: staging check using the new counters.
- When delivered, record the connectivity rule (including the origin check) in
  `docs/game-mechanics.md` and archive this plan.
