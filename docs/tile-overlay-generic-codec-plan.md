# Plan: generic tile overlay codec (eliminate per-field wire duplication)

## Background

Adding "natural wonders" to the game (Aug 2026) required fixing the same bug
twice, in two different files (#1160, #1162), because a tile's overlay data
(fort, shard site, natural wonder, muster, ...) has to survive **three
independent hand-written codecs** across two process boundaries:

```
DomainTileState (sim, in-memory; packages/game-domain)
   |  codec #1: tile-delta-stringify-cache.ts + tile-delta-overlay-fields.ts
   v
SimulationTileWireDelta (sim, in-process wire shape; runtime-types.ts)
   |  codec #2: proto-serialization.ts (sim) -- snake_case AND camelCase arrays
   v
ProtoSimulationEvent (gRPC wire format, sim <-> gateway; sim-protocol .proto)
   |  codec #3: sim-client.ts normalizeProtoTile (gateway)
   v
gateway's internal tile representation -> JSON over WebSocket -> browser
   |  client parses e.g. naturalWonderJson back into a typed object
   v
client-side tile store
```

Every overlay field name appears, hand-typed, in roughly **20 files**
(`shardSiteJson` alone: `grep -rl shardSiteJson apps/ packages/` returns 21
matches as of 2026-08-03). A new overlay field requires editing most of them.
Two of the four proto-serialization.ts spots were fixed in this pass
(#1162 + a follow-up table-driven refactor); the underlying multi-codec
shape is unchanged.

## The idea

Replace "one named field per overlay kind, hand-listed at every layer" with
**one generic map field**, keyed by overlay name, threaded through all three
codecs unchanged. Concretely:

- `.proto`: replace `fort_json`, `observatory_json`, `shard_site_json`,
  `natural_wonder_json`, ... (currently ~9 separate `optional string` fields)
  with a single `map<string, string> overlay_json = N;` field.
- `SimulationTileWireDelta` (sim-side wire shape): same idea --
  `overlayJson?: Record<string, string>` instead of one optional string per
  kind.
- `DomainTileState` -> wire-delta codec: iterate a single, already-existing
  list of known overlay keys (`OVERLAY_JSON_FIELDS`-style) and populate
  `overlayJson[key]` generically, instead of one named field per kind.
- Client: parse `overlayJson[key]` generically instead of one named
  `xJson` per kind in `client-gateway-sync.ts` / `client-tile-merge.ts`.

Once this lands, **adding a new overlay kind touches zero wire-schema
files** -- only `DomainTileState` (add the field) and the domain logic that
sets it. The wire layer picks it up automatically because it's keyed
generically, not by a hardcoded field name.

## Why not do this now

- It's a real `.proto` schema change (removing 9 numbered fields, adding a
  map field) -- needs care around backward compatibility during rollout
  (old client connected to new gateway, or vice versa, during a deploy).
- Every consumer of the named fields needs to switch to map access:
  `event-recovery.ts`, `proto-serialization.ts`, `sim-client.ts`,
  `client-gateway-sync.ts`, `client-tile-merge.ts`, `ai/planner-tile-delta-merge.ts`,
  and the various snapshot builders (`player-snapshot.ts`,
  `world-status-snapshot.ts`, `runtime-state-export.ts`).
- The clear-signaling semantics (`"xJson" in delta` means "this delta
  touched the field"; a present-but-falsy value means "explicitly cleared")
  need an equivalent for a map field -- e.g. `overlayJson: { naturalWonder: "" }`
  as an explicit-clear marker vs. the key being absent from the map entirely
  for "untouched". This is a compatible pattern but needs to be designed and
  tested, not improvised mid-refactor.
- It's an architecture change spanning both processes (`apps/simulation`,
  `apps/realtime-gateway`) and the client -- worth doing deliberately with a
  test plan, not as a quick follow-up to an unrelated bug fix.

## Suggested approach when this is picked up

1. Add the new `overlay_json` map field to the `.proto` schema
   **alongside** the existing named fields (do not remove them yet).
2. Make `proto-serialization.ts` populate both the map field and the
   existing named fields for one deploy cycle (belt-and-suspenders), driven
   off the same `OVERLAY_FIELDS` table already introduced in
   `proto-overlay-fields.ts` -- extending that table to also emit the map
   entry costs one line per call site, not per field.
3. Migrate `sim-client.ts` and the client to read from the map field,
   falling back to the named fields if the map is absent (covers an
   in-flight deploy where sim and gateway are on different versions
   momentarily).
4. Once staging (and prod) have been running the dual-write for a full
   deploy cycle with no fallback-path hits logged, remove the named fields
   from the `.proto` schema and all four remaining hand-written
   serialization spots.
5. Repeat the same map-based approach for `DomainTileState` ->
   `SimulationTileWireDelta` if desired (this layer is already a single
   shared table per field via `tile-delta-overlay-fields.ts`, so the
   remaining win there is smaller, but consistency has value).

## Effort estimate

Medium: a few focused days including the dual-write rollout window, not a
multi-week project. Most of the risk is in step 3 (getting the fallback
semantics right during a mixed-version deploy window) rather than the
mechanical parts.
