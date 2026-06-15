# State, Caches, and Persistence Discipline

Read this before adding or changing any in-memory cache/map, anything written into a
snapshot/checkpoint, or any code that records per-command/per-event data. These rules
exist because a replay cache that was correct for years silently grew to 122k entries /
37MB and froze the sim event loop ~16s on every checkpoint, surfacing as
`SIMULATION_UNAVAILABLE` during play (PR #615, 2026-06-15). The design was locally
correct and degraded globally as new producers were added.

## Bound growable structures directly
- Any `Map`/`Set`/array that grows with load or game time needs its **own** hard size or
  TTL bound. Do not rely on an indirect/proxy bound (e.g. "entries get pruned when their
  command reaches a terminal state") — the day a producer stops hitting that path, the
  structure leaks. The replay cache bounded `terminalReplayCommandIds` and
  `commandIdsByPlayerSeq` but never `recordedEventsByCommandId` itself; AI/automation
  events never terminalized, so that map grew forever.
- Eviction must emit a counter (see "counter on every guard/skip/cap"). A cap that fires
  silently hides the underlying leak.

## A broad chokepoint must not apply a policy to everything by default
- `emitEvent` recorded *every* event into the replay cache, so each new server-generated
  command type (AI planners, territory automation, accrual, recovery synthetics) inherited
  idempotency-replay tracking that it never needed. Make such policies **opt-in by intent**
  (only client-resubmittable commands need replay/idempotency), not opt-out.
- When you add a new *producer* to a shared pipe (new command/event source, new writer to a
  shared store), re-check every policy that pipe applies. Old assumptions ("all commands
  terminalize and get pruned") were true only for the original producers.

## Snapshots carry STATE, not logs or caches
- A checkpoint/snapshot should hold reconstructable world state only. Idempotency/replay/
  dedup data must be bounded or rebuilt from the event store on recovery — never serialize a
  growing cache wholesale into every checkpoint. Coupling snapshot size to a cache's size is
  the anti-pattern that caused the freeze.
- Recovery rebuilds state from the `world_events` store; verify any data you *drop* from the
  snapshot is either reconstructable from events or genuinely unneeded.

## Put a gauge on anything whose size depends on load or time
- Snapshot byte size, cache entry counts, queue depths, and per-player buffers all need a
  gauge/log line *before* they cause an incident. The freeze was the first signal only
  because nothing cheaper was watching. This extends the "counter on every guard/skip/cap"
  rule: also **gauge every growable structure**.

## Measure the harm, not a convenient proxy
- `sim_checkpoint_export_ms` was wall time including an off-thread `await`, which *obscured*
  the real synchronous block. The signal that actually localized the bug was
  `event_loop_blocked` lag (a true synchronous-stall measurement). Instrument the thing that
  hurts (synchronous event-loop block duration), not an adjacent number.

## A one-off patch is a prompt to look for the class
- The single hand-deletion of the `accrual:` synthetic id from the replay cache was evidence
  the design was wrong for a whole class of server-generated commands — but it got treated as
  a one-off. When you patch one instance of a leak/bug, ask what else shares the same shape.
