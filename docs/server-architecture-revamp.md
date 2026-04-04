# Server Architecture Revamp

## Current bottlenecks

- One Node process handles websocket delivery, simulation, AI, and world mutation.
- Human actions compete directly with late-game AI turns on the same event loop.
- Initial world sync and chunk updates still serialize large visible areas in-process.
- Persistence is snapshot-oriented, which makes startup and recovery heavier than necessary.

## Near-term target

Keep the current single-process server, but make it human-priority:

- Human auth and frontier/combat actions outrank AI work.
- AI runs in bounded slices and can be deferred while humans are active.
- World confirmation paths send targeted deltas first, heavier sync second.

## Mid-term target

Split responsibilities into two services:

1. Simulation service
   - Owns world state, AI, combat, settlement, victory pressure, and persistence.
   - Emits authoritative world events and tile deltas.

2. Realtime gateway
   - Owns websocket sessions, auth, subscriptions, and fanout.
   - Consumes simulation events and pushes player-specific deltas.

## Suggested rollout

1. Instrument request-to-result latency for expand, settle, and attack.
2. Reduce AI tick monopolization with work budgeting and bounded scheduling.
   - Status: in progress.
   - AI now gets a guaranteed minimum slice even while humans are active or auth is hot.
   - Human activity throttles AI batch size instead of skipping AI ticks entirely.
   - Queue backpressure and event-loop pressure now clamp AI to single-turn slices instead of allowing runaway batches.
3. Make frontier/settlement confirmations delta-first and avoid chunk refresh dependence.
4. Extract simulation commands and events behind an internal interface in-process.
   - Status: expanded.
   - AI actions now go through an internal simulation-command seam instead of calling websocket-shaped message handling directly.
   - Human mutating gameplay commands now also enter a prioritized in-process simulation queue instead of executing inline on the websocket callback.
   - The queue is split into human, system, and AI lanes, with human jobs draining first and background world maintenance bounded separately.
   - The queue drain is now time-budgeted and quota-based, so large command bursts yield back to the event loop instead of recursively draining to completion.
   - Barbarian actions and barbarian maintenance now enter the bounded system lane instead of mutating world state directly from runtime intervals.
   - AI scheduler orchestration now lives in a dedicated module instead of `main.ts`, which makes human/auth/chunk-priority rules testable without re-threading the whole server file.
   - Chunk bootstrap and snapshot orchestration now live in a dedicated chunk module, so the gateway file only wires dependencies instead of owning the staged snapshot policy inline.
5. Build reusable per-turn simulation indexes.
   - Cache frontier anchors, structure candidates, and other selector inputs once per AI turn.
   - Prefer incremental invalidation over recomputing territory scans in every selector.
6. Move AI/simulation onto a separate worker or service while keeping websocket gateway stable.
   - Status: worker-backed in-process bridge.
   - AI ticks now build one shared cycle snapshot for the selected batch and enqueue turn execution onto an internal AI worker queue.
   - AI dispatch now runs continuously in bounded slices, while `AI_TICK_MS` acts as a per-AI cadence target instead of a single global batch window.
   - AI actions now enqueue simulation commands onto a separate internal simulation-command queue instead of mutating world state inline from the AI decision path.
   - Human and AI simulation queue pressure is now visible independently in `/admin/runtime/debug`.
   - AI scheduling now exposes runtime scheduler state so starvation/backpressure is visible in `/admin/runtime/debug`.
   - AI action choice and GOAP planning now run in a dedicated `worker_threads` planner, with the main thread retaining authoritative world mutation.
   - Combat/frontier resolution rolls now run in a dedicated `worker_threads` simulation worker, with the main thread applying the authoritative tile/state mutations after the worker returns.
   - Chunk payload serialization now runs in a dedicated `worker_threads` serializer, with the main thread retaining authoritative tile visibility and chunk selection.
   - Next step is to move full simulation command execution and world-state ownership behind the same boundary or an external simulation service without changing the gateway contract.
7. Replace snapshot-first persistence with an indexed store such as SQLite or Postgres.

## Desired invariants

- Human action confirmation should not wait behind AI computation.
- A single AI empire should not block the event loop for multiple seconds.
- Chunk snapshots should be exceptional, not the normal confirmation path.
- Websocket gateway should remain responsive even if simulation is busy.
