## Rewrite Week Summary

This document summarizes the main rewrite work completed during the current week, the biggest issues uncovered during localhost parity validation, and the remaining production blockers.

Companion design and implementation plan:

- `docs/rewrite-hard-plan-2026-04-16.md`

### Goal

The active rewrite goal remains:

- split the runtime into:
  - `apps/realtime-gateway`
  - `apps/simulation`
  - `packages/game-domain`
- move durability to Postgres-backed command/event/snapshot stores
- stop human frontier actions from sharing fate with AI, chunking, snapshotting, and other background work in a single Node process

### What Landed

#### Rewrite package graph in main

The split rewrite packages now live in the main checkout and are part of the workspace:

- `apps/realtime-gateway`
- `apps/simulation`
- `packages/game-domain`
- `packages/sim-protocol`
- `packages/client-protocol`

This moved the rewrite from a detached localhost experiment into the main repository source graph.

#### Core migrated command surface

The rewrite path now supports the following core actions end-to-end through the gateway/simulation path:

- `ATTACK`
- `ATTACK_PREVIEW`
- `EXPAND`
- `BREAKTHROUGH_ATTACK`
- `SETTLE`
- `BUILD_FORT`
- `BUILD_OBSERVATORY`
- `BUILD_SIEGE_OUTPOST`
- `BUILD_ECONOMIC_STRUCTURE`
- `CANCEL_FORT_BUILD`
- `CANCEL_STRUCTURE_BUILD`
- `REMOVE_STRUCTURE`
- `CANCEL_SIEGE_OUTPOST_BUILD`
- `CANCEL_CAPTURE`
- `COLLECT_TILE`
- `COLLECT_VISIBLE`
- `CHOOSE_TECH`
- `CHOOSE_DOMAIN`
- `SET_TILE_COLOR`
- `SET_PROFILE`

Additional migrated rewrite actions now in `main`:

- `UNCAPTURE_TILE`
- `OVERLOAD_SYNTHESIZER`
- `SET_CONVERTER_STRUCTURE_ENABLED`
- `REVEAL_EMPIRE`
- `REVEAL_EMPIRE_STATS`
- `CAST_AETHER_BRIDGE`
- `CAST_AETHER_WALL`
- `SIPHON_TILE`
- `PURGE_SIPHON`
- `CREATE_MOUNTAIN`
- `REMOVE_MOUNTAIN`
- `AIRPORT_BOMBARD`
- `COLLECT_SHARD`

#### Social/diplomacy migration

The rewrite gateway now handles in-memory social state and bootstrap hydration for:

- `ALLIANCE_REQUEST`
- `ALLIANCE_ACCEPT`
- `ALLIANCE_REJECT`
- `ALLIANCE_CANCEL`
- `ALLIANCE_BREAK`
- `TRUCE_REQUEST`
- `TRUCE_ACCEPT`
- `TRUCE_REJECT`
- `TRUCE_CANCEL`
- `TRUCE_BREAK`

This is implemented in the rewrite gateway and covered by targeted tests.

#### Client command lifecycle and debugging

Client work added during the week:

- explicit command ids / client sequence handling on migrated rewrite actions
- bridge/debug status badge in the HUD
- runtime identity visible to the browser
- better error popups with debug-download buttons for actionable failures
- safer socket close handling for abnormal close codes
- better queue handling for attack cooldowns and frontier mismatches

#### Snapshot bridge / localhost parity work

A large amount of effort went into making localhost rewrite validation usable against imported season state:

- runtime provenance / fingerprinting
- snapshot bridge identity in health/debug/UI
- player-scoped snapshot bootstrap instead of full-world bootstrap in the browser
- season victory cards restored
- economy fields restored and corrected multiple times
- reveal/town/detail/bootstrap issues patched repeatedly
- frontier sync mismatch surfaced with a proper popup and debug path

#### Memory/OOM hardening

The production monolith OOM incident exposed a missing acceptance area. Rewrite-side hardening added this week includes:

- checkpoint watermarks
- checkpoint phase memory sampling
- high-memory checkpoint deferral
- lower-duplication snapshot-store write path in simulation

### Major Problems Uncovered

#### Stale-process / wrong-world confusion

Local validation repeatedly drifted onto:

- stale processes
- wrong season snapshot
- wrong seed profile
- wrong websocket target

This forced the addition of explicit runtime provenance:

- source type
- season id
- world seed
- snapshot label
- fingerprint
- player count
- seeded tile count

Without that, localhost parity work was too ambiguous.

#### Snapshot bridge parity drift

The snapshot bridge repeatedly exposed mismatches between:

- real production/saved world state
- reconstructed seed terrain
- client-visible bootstrap state

Problems surfaced in:

- town overview
- economy and breakdown sources
- visibility radius
- frontier ownership display
- leaderboard settled counts
- season victory cards
- impossible-looking terrain/resource combinations

This means snapshot-bridge parity is not a side concern; it is a first-class acceptance area.

#### Legacy server stability

While using the legacy server for new-season localhost AI validation, two real operational issues remained visible:

- worker import/runtime instability
- high snapshot/chunk memory pressure

That strengthens the case for finishing the split architecture instead of extending the monolith.

### What Is Still Missing

#### Remaining migration gaps

The previously missing advanced/admin/ability slice has now landed in the rewrite path in `main`.

What remains is not that command inventory, but the proof and parity work around it:

- complete localhost behavior parity checks for the newly migrated action surface
- verify reconnect persistence and recovery across the migrated action surface
- verify snapshot-bridge correctness for the migrated action surface where the browser is still bootstrap-driven
- replace any remaining stale client/gateway capability assumptions with the current supported surface
- finish DB-backed and production-topology verification for the split runtime

This is the current risk shape:

- command routing support is materially broader than it was when this summary was first drafted
- localhost proof is still incomplete
- production proof is still absent

#### Broader localhost parity smoke

Still not fully complete:

- structure placement / spend / update / render
- town overview correctness
- docks / visibility / render parity
- frontier claim UX parity
- attack preview / win chance parity
- reconnect persistence across the migrated surface

#### Production proof

Still not done:

- split Fly deploy from main
- DB-backed boot/connectivity verification there
- production client cutover
- 30-minute production frontier verification

### Plan Updates Required

The original rewrite plan remains correct, but three acceptance areas need to be explicit:

#### Runtime provenance / anti-stale guarantees

Every runtime must expose:

- source type
- season id
- world seed
- snapshot label
- fingerprint
- player count
- seeded tile count

and boot should fail if provenance is ambiguous or inconsistent.

#### Snapshot-bridge parity checklist

The plan needs a dedicated parity checklist for:

- town detail
- economy sources/rates
- visibility
- frontier ownership display
- leaderboard/victory
- docks / terrain / bootstrap render parity

#### Operational memory safety / OOM hardening

The plan should explicitly require:

- gateway chunk-cache byte/count caps
- simulation checkpoint streaming or lower-duplication writes
- memory sampling during checkpoint phases
- checkpoint deferral under memory pressure
- split-service memory budget verification before production cutover

### Current Honest Status

The rewrite is materially further along than it was at the start of the week, but it is still not production-ready.

What is true today:

- the split gateway/simulation architecture exists in main
- a meaningful command surface is migrated
- debugging and runtime provenance are much better
- localhost parity validation is much more actionable than before

What is still true today:

- localhost parity still has unresolved drift on the migrated surface
- the new 20-AI localhost worldgen seed is useful for rewrite validation, but it is still a fresh-world smoke profile rather than proof against a mature live AI season
- production topology and proof gates are still unfinished
- localhost parity still has unresolved drift
- Fly split deploy proof is not done
- production cutover proof is not done

### Recommended Next Thread Start

If a new thread is started, begin from:

1. remaining advanced/admin/ability rewrite actions
2. localhost parity sweep on the migrated surface
3. split Fly deploy proof
4. production client cutover
5. 30-minute production frontier verification
