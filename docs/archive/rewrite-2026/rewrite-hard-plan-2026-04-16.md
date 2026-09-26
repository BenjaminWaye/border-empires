# Hard Rewrite Plan: Dedicated Gateway + Authoritative Simulation + Postgres Event Store

## Status

This document is the current rewrite plan for the split runtime work already in progress in the local `main` checkout as of April 16, 2026.

It is not a greenfield design. The following already exists in `main` and should be treated as the active baseline:

- `apps/realtime-gateway`
- `apps/simulation`
- `packages/game-domain`
- `packages/sim-protocol`
- `packages/client-protocol`
- client-side command-id and gateway bridge work
- Postgres-backed rewrite command/event/snapshot storage scaffolding
- targeted rewrite integration and recovery tests

The remaining work is to finish the migration, close parity gaps, and prove the new stack under localhost and production load.

## Summary

Replace the current single-process runtime with a two-service architecture:

- `apps/realtime-gateway`: owns WebSocket sessions, auth, subscriptions, per-player fanout, client-facing ACK/error messages, and chunk delivery.
- `apps/simulation`: owns the authoritative world state, human command validation and reservation, combat resolution, AI, barbarian and system jobs, and persistence.
- Postgres: becomes the source of truth for command durability, event durability, projections, and recovery.

This remains the correct fix because the monolith still allows human frontier ingress to share fate with simulation drain, AI pressure, chunk work, and runtime jobs on the same Node process. The rewrite is only complete when a human frontier action cannot miss or materially delay `ACTION_ACCEPTED` because background work is busy.

## Why This Rewrite Exists

The rewrite is addressing four concrete classes of failure:

1. Human frontier actions can still be delayed behind unrelated work in the legacy runtime.
2. Localhost validation can drift onto stale processes, stale snapshots, or the wrong world without clear provenance.
3. Snapshot-bridge parity has repeatedly drifted in user-visible ways even when the new stack appears superficially healthy.
4. Memory pressure around snapshots, chunking, and checkpoint work has remained an operational risk.

The plan below treats all four as first-class acceptance areas, not cleanup tasks.

## Current Honest Baseline

### What has landed in local `main`

- rewrite packages are in the workspace and compile as first-class code, not detached experiments
- a meaningful command surface is migrated through the gateway/simulation path
- client command ids, client sequence tracking, and gateway bridge diagnostics exist
- runtime provenance is materially better than it was at the start of the week
- Postgres-backed rewrite storage exists for commands, events, and snapshots
- rewrite recovery, replay, and migration-path tests exist
- rewrite-side checkpoint watermarks and memory sampling work has started

### What is still missing

- migrated action inventory still needs an honest status table:
  - gateway and simulation support has now landed for the previously missing advanced/admin/ability slice
  - the plan document needs to track what is merely implemented versus what has reconnect proof, snapshot-bridge proof, localhost smoke proof, and production proof
  - client capability advertisement must stay in sync with the real migrated surface
- localhost season/worldgen proof still needs to be separated from production-like AI pressure proof:
  - a real 20-AI worldgen seed now exists for rewrite localhost smoke
  - that seed is still a fresh-world validation profile, not proof of mature-map parity or performance
- broader localhost parity proof:
  - structure placement, spend, update, and render
  - town overview correctness
  - docks, visibility, and render parity
  - frontier claim UX parity
  - attack preview and win chance parity
  - reconnect persistence across the migrated surface
- production proof:
  - split Fly deploy from local `main`
  - DB-backed boot and connectivity verification there
  - production client cutover
  - 30-minute production frontier verification

## Target Architecture

### 1. Runtime topology

Build and keep exactly three runtime layers:

- `apps/realtime-gateway`
  - Fastify and WebSocket process only
  - no authoritative world mutation
  - no AI planning or AI mutation
  - no combat resolution
  - no maintenance timers that can interfere with command ingress
  - no chunk serialization on the acceptance-critical path
- `apps/simulation`
  - single writer for authoritative world state
  - owns command ordering and world mutation
  - owns replay, recovery, and snapshot checkpoints
  - may use bounded helper workers, but only for work not required before command acceptance
- `packages/game-domain`
  - pure domain logic only
  - no sockets
  - no timers
  - no direct database calls

The old monolithic `packages/server/src/main.ts` remains transitional only. Do not keep extending it as if it were the long-term runtime.

### 2. Command path

Every mutating client action becomes a durable command envelope:

```ts
type CommandEnvelope = {
  commandId: string;
  sessionId: string;
  playerId: string;
  clientSeq: number;
  issuedAt: number;
  type:
    | "ATTACK"
    | "EXPAND"
    | "BREAKTHROUGH_ATTACK"
    | "SETTLE"
    | "BUILD_FORT"
    | "BUILD_OBSERVATORY"
    | "BUILD_SIEGE_OUTPOST"
    | "BUILD_ECONOMIC_STRUCTURE"
    | "CANCEL_CAPTURE"
    | "COLLECT_TILE"
    | "COLLECT_VISIBLE"
    | "CHOOSE_TECH"
    | "CHOOSE_DOMAIN";
  payload: Record<string, unknown>;
};
```

Gateway responsibilities:

- validate auth and session only
- assign `commandId` if the client omitted one
- persist the command to Postgres before simulation handling
- forward the command to simulation over a persistent internal stream
- emit `COMMAND_QUEUED` after durable enqueue
- never perform blocking world reads before forwarding

Simulation responsibilities:

- consume commands from a strict priority queue:
  - `human_interactive`
  - `human_noninteractive`
  - `system`
  - `ai`
- split frontier work into two stages:
  - Stage A: cheap validation, reservation or lock creation, acceptance or rejection decision, acceptance event append
  - Stage B: combat resolution, world mutation, economy or visibility follow-up, result events
- emit `ACTION_ACCEPTED` before chunk rebuilds, player refresh fanout, AI turns, or maintenance work

### 3. Internal gateway/simulation protocol

Use a persistent bidirectional RPC stream between gateway and simulation.

Transport default:

- gRPC streaming on a private internal port

Gateway to simulation messages:

- `SubmitCommand(CommandEnvelope)`
- `SubscribePlayer(playerId, subscriptionSpec)`
- `UnsubscribePlayer(playerId)`
- `Ping`

Simulation to gateway messages:

- `CommandAccepted`
- `CommandRejected`
- `CombatStarted`
- `CombatResolved`
- `PlayerDelta`
- `TileDeltaBatch`
- `VisionDelta`
- `ChunkInvalidation`
- `SessionKick`
- `RuntimeAlert`

Authority rules:

- simulation decides acceptance and rejection
- gateway never synthesizes `ACTION_ACCEPTED`
- gateway may synthesize transport-level errors only, such as expired auth or simulation disconnection

### 4. Persistence model

Postgres is the primary persistence layer immediately. Snapshot files are not the primary store.

Required tables:

- `commands`
- `command_results`
- `world_events`
- `world_snapshots`
- `player_projection`
- `tile_projection`
- `combat_lock_projection`
- `visibility_projection`
- `subscription_projection` if gateway recovery needs a durable form

Persistence rules:

- commands are durable before simulation begins handling them
- events are durable before gateway fanout
- snapshots are a recovery optimization only
- simulation recovery loads the latest snapshot plus replay of subsequent `world_events`
- command idempotency is enforced with unique constraints on `command_id` and `(player_id, client_seq)`

### 5. Client protocol changes

Keep the visible message family where practical, but make command identity explicit.

```ts
type CommandQueued = {
  type: "COMMAND_QUEUED";
  commandId: string;
  clientSeq: number;
};

type ActionAccepted = {
  type: "ACTION_ACCEPTED";
  commandId: string;
  actionType: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK";
  origin: { x: number; y: number };
  target: { x: number; y: number };
  resolvesAt: number;
};

type CommandRejected = {
  type: "ERROR";
  commandId?: string;
  code: string;
  message: string;
};
```

Client rules:

- every mutating command gets `clientSeq`
- in-flight UI binds to `commandId`, not only tile keys
- retries must preserve command identity unless the user explicitly reissues
- `COMMAND_QUEUED` without `ACTION_ACCEPTED` shows waiting state, not a silent duplicate resend
- reconnect recovery asks for unresolved commands by `clientSeq`

### 6. Chunking and visibility

Chunk work must be fully removed from the acceptance path.

Simulation responsibilities:

- emit semantic deltas:
  - tile owner and state changes
  - combat lock changes
  - structure changes
  - vision-source changes
- emit invalidation regions instead of serialized chunk payloads

Gateway responsibilities:

- maintain per-player subscriptions
- convert authoritative deltas into:
  - immediate tile and vision updates
  - deferred chunk refresh work on a separate worker pool

Chunk serialization is a catch-up path only. It is not a dependency for accepting a human action.

### 7. AI and system jobs

AI and scheduled world maintenance must live behind the same command bus boundary as everything else.

Simulation lanes:

- `human_interactive`
- `human_noninteractive`
- `system`
- `ai`

Execution rules:

- AI planners run in separate workers or a sibling AI process
- AI can enqueue commands only through the same command bus used by humans
- AI command production pauses whenever the human-interactive backlog is non-zero
- system jobs run in bounded slices and cannot preempt already-arrived human-interactive commands
- no AI or maintenance job executes inline inside the gateway

## Non-Negotiable Acceptance Areas

### Runtime provenance and anti-stale guarantees

Every runtime must expose:

- source type
- season id
- world seed
- snapshot label or source
- fingerprint
- player count
- seeded tile count

Surface this in:

- gateway health output
- runtime and debug endpoints
- browser bridge or debug badge
- downloaded debug bundles

Boot must fail when provenance is ambiguous or internally inconsistent. A localhost session running against the wrong snapshot or wrong world is not an acceptable validation environment.

### Snapshot-bridge parity checklist

Treat snapshot-bridge parity as a hard gate. The rewrite is not ready if any of the following can drift during localhost validation:

- town overview values and settlement details
- economy sources, rates, upkeep, and breakdown labels
- visibility radius, explored shaping, and ownership fog
- frontier ownership display and claim behavior
- leaderboard settled counts, income rows, and victory state
- docks, coastline, terrain, and resource rendering
- attack preview and win chance output
- reconnect persistence across migrated actions

Every parity bug found here should either get a regression test or a written reason why that exact behavior cannot be deterministically covered.

### Operational memory safety and OOM hardening

The rewrite must harden memory behavior before production cutover.

Required controls:

- gateway chunk-cache byte and entry caps
- bounded deferred chunk work queues
- simulation checkpoint memory sampling by phase
- checkpoint deferral under high RSS or heap pressure
- lower-duplication or streaming snapshot write paths
- explicit per-service memory budget targets verified under load

The rewrite is not done if it only moves old memory hazards into two processes instead of one.

## Implementation Plan

### Phase 1. Finish domain extraction and contracts

Status:

- partially landed

Complete the package boundaries so pure game rules live behind `packages/game-domain` and shared contracts live behind protocol packages.

Required work:

- continue moving frontier validation, combat application, ownership mutation, and progression rules into pure modules
- remove direct socket and database assumptions from migrated domain logic
- freeze the old monolith API and stop adding net-new rewrite behavior there
- make command and event contracts explicit in `packages/sim-protocol` and `packages/client-protocol`

Completion criteria:

- frontier validation runs from pure inputs without runtime imports
- extracted rule tests compile against `packages/game-domain`
- new rewrite behavior does not require importing monolith runtime modules

### Phase 2. Finish simulation-service authority

Status:

- partially landed

Build out `apps/simulation` until it is the real single writer for authoritative state.

Required work:

- complete Postgres-backed boot, recovery, and replay flows
- finish the strict priority command bus
- keep Stage A acceptance isolated from expensive resolution work
- migrate remaining human frontier and structure flows
- migrate unsupported advanced and admin actions
- keep deterministic replay outputs stable

Completion criteria:

- simulation boots and recovers from DB without depending on the old server runtime
- `ATTACK` and `EXPAND` acceptance and resolution work end-to-end without legacy WebSocket mutation paths
- unsupported action list above is either migrated or explicitly deferred from cutover scope

### Phase 3. Finish the realtime gateway

Status:

- partially landed

Complete `apps/realtime-gateway` as the only client-facing runtime.

Required work:

- keep auth, sessioning, subscriptions, and fanout in the gateway only
- complete command durability and forwarding flow
- finish player-specific delta and invalidation fanout
- keep chunk refresh work off the acceptance-critical path
- expose runtime identity and recovery status consistently

Completion criteria:

- browser clients can connect only to gateway and play against simulation on localhost
- gateway remains responsive while simulation is under AI and checkpoint load
- gateway never imports authoritative world mutation code

### Phase 4. Finish client command lifecycle migration

Status:

- partially landed

Update the client so all migrated actions rely on authoritative command identity instead of socket-era heuristics.

Required work:

- finish command-id and `clientSeq` tracking for all migrated actions
- bind optimistic visuals to command lifecycle instead of local resend assumptions
- make queued, accepted, resolving, rejected, and reconnecting states explicit
- complete reconnect recovery for unresolved commands
- preserve clear rejection reasons in the UI

Completion criteria:

- delayed commands do not create duplicate attacks
- disconnect and reconnect preserve pending commands cleanly
- bridge mismatch or stale-runtime failures are obvious to the user and operator

### Phase 5. Port AI and system jobs behind the boundary

Status:

- partially landed

Move all remaining AI and world-maintenance behavior onto the simulation-side command bus.

Required work:

- rebuild AI scheduling around command production instead of direct mutation
- keep planners outside the authoritative command loop
- turn barbarian and system timers into scheduled command producers
- verify that human-interactive acceptance remains stable during heavy AI pressure

Completion criteria:

- AI budget breaches can occur only in AI workers or AI lanes
- human frontier acceptance latency remains inside budget while AI load is active
- no AI planner breach can block command receipt or ACK emission

### Phase 6. Production cutover and monolith deletion

Status:

- not started

Finish the operational migration and remove the old runtime as the serving path.

Required work:

- deploy gateway and simulation as separate Fly services
- verify DB-backed boot and internal connectivity in that topology
- cut the client to the gateway runtime
- run the required live frontier verification
- remove the monolith from gameplay serving after proof

Completion criteria:

- production deploy uses only gateway plus simulation for gameplay serving
- the old monolithic runtime is no longer required for live gameplay traffic
- deletion happens only after localhost and production proof gates pass

## Verification and Acceptance

### Required automated coverage

Domain tests:

- frontier validation
- combat resolution
- ownership and visibility invalidation rules
- duplicate command idempotency

Simulation integration tests:

- `ATTACK` accepted under AI and system load
- command replay determinism
- recovery from latest snapshot plus event replay
- unsupported action migration coverage as actions land

Gateway integration tests:

- reconnect with unresolved commands
- subscription fanout correctness
- chunk invalidation after tile deltas
- runtime provenance surfaced in health and debug outputs

Client integration or end-to-end tests:

- queued attack to accepted to result
- delayed simulation without duplicate send
- rejection reasons visible in UI
- disconnect and reconnect during in-flight combat
- snapshot-bridge parity coverage where deterministic fixtures are practical

### Required localhost proof before merge

Run a repeatable localhost harness with:

- one human client issuing chained frontier actions at normal play speed
- forty AI players active
- barbarian and system jobs enabled
- chunk subscriptions enabled
- persistence enabled
- runtime provenance visible in health, UI, and debug bundle output

Pass criteria:

- `ACTION_ACCEPTED` p95 under `100ms`
- `ACTION_ACCEPTED` p99 under `250ms`
- no accept timeout over `500ms`
- `frontier_action_received` present for every submitted command
- no missing `commandId` correlation in the debug bundle
- gateway event-loop max under `50ms`
- simulation event-loop max under `100ms` during human attacks
- no stale-runtime ambiguity during the run
- snapshot-bridge parity checklist passes for the migrated surface

### Required production proof before declaring done

Deploy gateway and simulation separately and verify them against the production topology.

Required proof:

- DB-backed boot and service connectivity verified in Fly
- controlled live verification against a production snapshot copy first
- then a production run with 30 minutes of human frontier spam against an active AI map
- zero attack-sync-delayed debug bundles
- accepted commands correlated end-to-end by `commandId`
- command rejection reasons visible in the client
- no gateway event-loop spike above `100ms`
- no simulation human-interactive backlog older than `250ms`
- no service exceeds its memory budget target during the run

Do not declare the rewrite complete until both localhost and production pass these gates.

## Rollout Defaults

- rollout choice: hard rewrite
- persistence choice: full DB rewrite
- database: Postgres
- internal transport: persistent gRPC stream between gateway and simulation
- authoritative owner: simulation only
- client compatibility: preserve current gameplay message family where practical, but explicit command identity is required and breaking client changes are acceptable
- deletion rule: keep domain rules, discard the old runtime topology
- definition of fixed: no human frontier action can miss or materially delay `ACTION_ACCEPTED` because of AI, chunking, maintenance, checkpointing, or other background work

## Immediate Next Steps

1. Replace the stale unsupported-action list with a concrete status table: implemented, reconnect-proven, snapshot-bridge-proven, localhost-smoke-proven, production-proven.
2. Turn the snapshot-bridge parity checklist into a repeatable localhost smoke script plus targeted regression tests.
3. Finish DB-backed boot and recovery verification for the split Fly topology.
4. Prove gateway and simulation latency and memory budgets under AI load before any client cutover.
