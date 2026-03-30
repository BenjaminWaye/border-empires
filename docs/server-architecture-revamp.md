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
2. Reduce AI tick monopolization with work budgeting and human-priority scheduling.
3. Make frontier/settlement confirmations delta-first and avoid chunk refresh dependence.
4. Extract simulation commands and events behind an internal interface in-process.
   - Status: started.
   - AI actions now go through an internal simulation-command seam instead of calling websocket-shaped message handling directly.
5. Build reusable per-turn simulation indexes.
   - Cache frontier anchors, structure candidates, and other selector inputs once per AI turn.
   - Prefer incremental invalidation over recomputing territory scans in every selector.
6. Move AI/simulation onto a separate worker or service while keeping websocket gateway stable.
   - Status: started in-process.
   - AI ticks now build one shared cycle snapshot for the selected batch and enqueue turn execution onto an internal AI worker queue.
   - AI actions now enqueue simulation commands onto a separate internal simulation-command queue instead of mutating world state inline from the AI decision path.
   - Next step is to lift these two queues behind a `worker_threads` or external simulation process boundary without changing the gateway contract.
7. Replace snapshot-first persistence with an indexed store such as SQLite or Postgres.

## Desired invariants

- Human action confirmation should not wait behind AI computation.
- A single AI empire should not block the event loop for multiple seconds.
- Chunk snapshots should be exceptional, not the normal confirmation path.
- Websocket gateway should remain responsive even if simulation is busy.
