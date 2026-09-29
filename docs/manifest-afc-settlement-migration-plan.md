# AFC settlement migration — implementation plan

Status: planned (2026-09-29), not yet executed

Source: user decision (2026-09-29), resolving a gap this session's review of
PR #2085 surfaced — an existing, still-alive empire that settled before the
Manifest/AFC rework shipped has no `tile.afc` and no migration path ever
retrofits one; only a genuinely fresh spawn or a full elimination-respawn
creates one (`apps/simulation/src/runtime-respawn-helpers.ts:171,208,268` are
the only three sites that ever set `afc:`). The user's direction: **do not**
replace or convert the existing settlement — add a new AFC on a nearby free
tile instead, leaving the settlement itself untouched.

## Current state (read from code, 2026-09-29)

- **The exact trigger point already exists and is the right one to extend.**
  `ensurePlayerHasSpawnTerritory` (`runtime-respawn-helpers.ts:108`) runs via
  `spawnAndAnnounce` (`apps/simulation/src/simulation-service/prepare-and-join-player.ts:32`)
  from **`preparePlayerHandler`, which the file's own comment says "runs on
  every authenticated connection"** (`:67`). It only fires when
  `territoryTileKeys.size === 0` (`:122-124`) — a player with an existing
  settlement never reaches it. This means every legacy player without an AFC
  already reconnects through a hook that could carry a second, narrower
  check: "has territory, but zero AFCs" — no new connect-time plumbing
  needed, no risky one-shot world-scan migration job required either. Legacy
  players simply pick up their AFC transparently on their next reconnect.
- **The placement search this needs already exists**, built for a different
  feature. `chooseLegacySpawnPlacement`
  (`apps/simulation/src/spawn-placement/spawn-placement.ts:99`) takes an
  optional `rallyAnchor: {x,y}` (`:28`) — when present, it searches only
  tiles within `RALLY_SPAWN_RADIUS` (24 tiles, `:50`) of that anchor, closest
  first, through `RALLY_SPAWN_SEARCH_ORDER`'s progressively relaxed passes
  (prefer near a town and food, fall back to "closest open land regardless
  of quality," `:67-73`) — deterministic per player via `hashString(playerId)`
  (`:166`), and it already excludes owned/town/dock tiles and (when
  `coastalLandKeys` is supplied) requires actual land-region reachability,
  not just Manhattan-distance proximity across water (`:107-126`). This is
  precisely "find free land near an anchor point" — built for the "spawn
  near a friend" rally-invite feature, but the algorithm doesn't care what
  the anchor represents. No new placement logic needed; call it with the
  player's own settlement as the anchor instead of an inviting friend's
  location.
- **The AFC-creation object literal is identical across all 3 existing
  sites** (`{ ownerId: playerId, status: "active", activatedAt: ctx.now() }`
  alongside `ownerId`/`ownershipState: "SETTLED"` on the tile itself) — a
  4th site reuses this verbatim, no new shape to design.
- **`ownedAfcTileKeys`** (`player-runtime-summary.ts:121`) is an
  incrementally-maintained `Set<string>` (added to on AFC creation, removed
  on loss — `:335`, `:368`), rebuilt from real tile state during hydration.
  `summaryForPlayer(playerId).ownedAfcTileKeys.size === 0` is an O(1),
  already-correct "does this player have zero AFCs" check — no tile scan
  needed.
- **No existing "which of my towns is the anchor" concept applies.**
  `homeAfcTileKey` (`afc-module-commissioning.ts:29`) picks a player's
  *oldest AFC* by `activatedAt` for module-docking purposes — irrelevant
  here, since the whole point is that no AFC exists yet. This plan needs its
  own, much simpler anchor choice: the player's own settled town/tile with
  the lexicographically smallest tile key (deterministic, matches this
  codebase's own established "tile key breaks ties" convention rather than
  inventing a new one).
- **No reward/floor should come with this**, unlike a genuine respawn.
  `ensurePlayerHasSpawnTerritory` bumps a fresh spawn's manpower/gold to a
  floor (`:270-271` in the file) because that player is starting from
  nothing. A legacy player getting a retroactive AFC already has a running
  empire — granting free manpower/Coin here would be an unearned bonus, not
  a fair backfill. Only the tile itself should be created.

## Design decisions

1. **Trigger: per-connect check inside the existing PrepareOrJoin path, not
   a bulk migration job.** Extending `preparePlayerHandler`'s existing
   per-connection hook means legacy players get their AFC the next time they
   reconnect, with zero risk of a single giant operation touching every
   player's state at once during a deploy. A player who never reconnects
   again simply never gets one — an acceptable tradeoff (they're not
   actively playing to notice either way), and avoids the "world tiles not
   loaded yet at startup" hazard `ensurePlayerHasSpawnTerritory` already
   guards against for exactly this reason (`:125-139`).
2. **Anchor: the player's own settled tile with the smallest tile key**,
   not "nearest to camera" or similar client-driven state (the server has
   no reliable notion of where a player is currently looking, and
   determinism matters for reproducible tests). A player with multiple
   towns gets their AFC near whichever one sorts first — arbitrary but
   stable, matching precedent.
3. **Reuse `chooseLegacySpawnPlacement`'s `rallyAnchor` path directly,
   skip `claimFairSpawnSite`.** `claimFairSpawnSite`
   (`spawn-placement-index.ts`) is the "equal-opportunity roster" allocator
   for genuinely new players spreading out across the map fairly — it has
   no anchor-biasing concept and isn't the right tool for "near this specific
   existing tile." `ensurePlayerHasSpawnTerritory` tries it first only
   because a *new* player's rallyAnchor is optional/best-effort; this
   migration's anchor is mandatory and specific, so going straight to
   `chooseLegacySpawnPlacement({ ..., rallyAnchor })` is both simpler and
   more correct here.
4. **No manpower/Coin floor, no respawn notice reuse.** This isn't a
   respawn — see Current State above. A different, purpose-built
   announcement (not `preparePlayerRespawnNotice`, which is worded and typed
   around "you were wiped out") is worth adding so the new structure doesn't
   appear on the map with zero explanation, but keep it minimal: this plan
   scopes only the tile creation + a plain one-line feed/toast entry, not a
   full announcement UI. See step 4 below.
5. **Idempotent by construction, not by a separate "already migrated"
   flag.** Guarding on `ownedAfcTileKeys.size === 0` means a player who
   already has an AFC (whether from normal spawn, an earlier migration
   grant, or a captured/reassigned one) is a fast no-op on every subsequent
   connect — no separate persisted "has this player been migrated" bit to
   maintain or ever get out of sync.

## Implementation steps

### 1. New helper — `runtime-respawn-helpers.ts`
`ensurePlayerHasAfc(ctx: RuntimeRespawnContext, playerId: string): boolean`,
structurally parallel to `ensurePlayerHasSpawnTerritory`:
- `const player = ctx.players.get(playerId); if (!player) return false;` —
  unlike the spawn-territory helper, this never needs to create a player
  record; by construction it only ever runs for a player who already has
  territory, so they already exist.
- `if (ctx.summaryForPlayer(playerId).territoryTileKeys.size === 0) return false;`
  — the complementary guard to `ensurePlayerHasSpawnTerritory`'s own check;
  a player with no territory belongs to that path, not this one.
- `if (ctx.summaryForPlayer(playerId).ownedAfcTileKeys.size > 0) return false;`
  — already has one, no-op.
- Same `ctx.tiles.size === 0` world-not-loaded guard as
  `ensurePlayerHasSpawnTerritory` (`:132-139`), for the same reason.
- Find the anchor: iterate `ctx.tiles.values()` filtering
  `tile.ownerId === playerId && tile.ownershipState === "SETTLED"` —
  **not** also requiring `tile.town`. Confirmed against
  `player-runtime-summary.ts:318` vs. `:327`: `SETTLED` and "has a town" are
  tracked as separate, independent conditions there (a settled mine, farm,
  or other structure tile can be `SETTLED` with no town at all), so
  requiring a town here would silently strand a player whose only settled
  tiles happen not to be towns. Pick whichever qualifying tile has the
  smallest `simulationTileKey(tile.x, tile.y)`. If a player has territory
  (the earlier guard) but genuinely zero `SETTLED` tiles (FRONTIER-only
  ownership), there is no reasonable anchor — return `false` and retry on
  their next connect once (if ever) they actually settle something, rather
  than anchoring off a frontier tile they don't yet firmly hold.
- `const spawn = chooseLegacySpawnPlacement({ playerId, tiles: ctx.tiles.values(), blockedTileKeys, coastalLandKeys: ctx.coastalLandKeys(), hasNearbySettled: ctx.hasNearbySettled, hasNearbyTown: ctx.hasNearbyTown, hasNearbyFood: ctx.hasNearbyFood, rallyAnchor: anchor });`
  (same `blockedTileKeys` construction as the existing helpers —
  `pendingSettlementsByTile` + `locksByTile`).
- On a found tile: same `afc: { ownerId: playerId, status: "active", activatedAt: ctx.now() }` /
  `ownerId`/`ownershipState: "SETTLED"` object literal as the other 3 sites,
  `ctx.replaceTileState(...)`, `ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", ... })`
  — copy `ensurePlayerHasSpawnTerritory`'s tail exactly, minus the
  manpower/gold floor and the respawn-notice call (Design decision 4).
- Return `true` on success, `false` on "no site found this attempt" (a
  crowded map might genuinely have no free tile within
  `RALLY_SPAWN_RADIUS` of every candidate anchor — this degrades to "try
  again next connect," not a crash or a wider, uncontrolled search radius
  the player didn't ask for).

### 2. Wire into `SimulationRuntime` and the connect path
- `runtime.ts`: add `ensurePlayerHasAfc(playerId: string): boolean` next to
  `ensurePlayerHasSpawnTerritory` (`:1750`), delegating to the new helper
  with the same `RuntimeRespawnContext` construction that method already
  builds.
- `prepare-and-join-player.ts`'s `spawnAndAnnounce`: after
  `ensurePlayerHasSpawnTerritory` resolves, call
  `deps.runtime.ensurePlayerHasAfc(playerId)` unconditionally (it's already
  a fast no-op for anyone who doesn't qualify, per Design decision 5 — no
  need to gate the call itself on `!spawned`, since a *freshly* spawned
  player's brand-new AFC already satisfies `ownedAfcTileKeys.size > 0` and
  this becomes an immediate no-op for them). If it grants one, log it
  distinctly from the existing `"spawned runtime territory for..."` message
  (e.g. `"granted migration AFC for reconnecting player"`) so the two paths
  stay distinguishable in logs/metrics.

### 3. Metrics
Mirror `metrics-auth-recovery.ts`'s pattern (a small counter incremented
whenever `ensurePlayerHasSpawnTerritory` actually places a fresh spawn) with
an equivalent counter for this grant, so the migration's real-world uptake
(how many legacy players actually reconnect and pick one up, and how often
the placement search comes up empty) is observable rather than invisible.

### 4. Minimal player-facing acknowledgment
Not a full announcement system — scope this to the smallest thing that
avoids "a new building silently appeared on the map with zero explanation":
a single feed/event-log entry (check `personal-impact-log.ts`'s existing
entry-kind pattern, the same system already used for Waystation activation
and other one-off account moments) saying an Automated Fabrication Complex
was established near `(x, y)`. No modal, no reward copy — this is
infrastructure being backfilled, not an achievement.

### 5. Tests
New `apps/simulation/src/runtime-ensure-player-has-afc.test.ts` (or
co-located near `runtime-respawn-helpers.ts`, matching that file's own test
neighbors):
- A player with a settled town and zero AFCs gets one within
  `RALLY_SPAWN_RADIUS` of their town on the next `ensurePlayerHasAfc` call.
- A player who already owns an AFC is untouched (no second AFC created, no
  tile state change at all).
- A player with zero territory is untouched (this path is a no-op for
  them; `ensurePlayerHasSpawnTerritory` is what should fire instead —
  assert both helpers' behavior together to pin the handoff between them).
- The granted tile respects existing ownership/blocked-tile rules (doesn't
  land on another player's territory, a pending settlement, or a locked
  tile).
- Calling it twice in a row for the same now-AFC-having player is a fast
  no-op the second time (idempotency, Design decision 5).
- Integration test through the real `PrepareOrJoin` path (matching how
  `ensurePlayerHasSpawnTerritory` itself is likely already covered end to
  end — check for an existing test file exercising `preparePlayerHandler`/
  `spawnAndAnnounce` and add a sibling case there) confirming a legacy
  player's next reconnect actually grants the AFC via the real handler, not
  just the helper in isolation.

### 6. Docs + changelog
- Update `docs/manifest-full-plan.md`'s "Resolved contradictions" section
  (or §4) noting this migration path now exists, so a future reader doesn't
  rediscover the same "what about existing players" gap this session's
  review surfaced.
- Changelog entry (AGENTS.md gate): plain language — existing empires that
  settled before Automated Fabrication Complexes existed now receive one
  automatically, placed on free land near their original settlement, the
  next time they reconnect; their settlement itself is untouched.

## Explicitly out of scope here

- Converting/replacing the existing settlement tile itself — the user's
  direction was explicitly additive (a nearby AFC), not a conversion.
- A bulk one-shot migration job touching every player at once — Design
  decision 1 covers why the per-connect path is preferred.
- Any manpower/Coin grant alongside the new AFC — Design decision 4.
- A full announcement/modal UX for the grant — step 4 scopes this to a
  plain feed entry; a richer "your empire received infrastructure" moment
  (potentially reusing this session's own delivery-animation prototype,
  though that plan is specifically scoped to a *module* landing on an
  *existing* AFC, not the AFC's own first appearance) is a natural
  follow-up, not blocking this migration from shipping.
- Retrying with a wider search radius when `RALLY_SPAWN_RADIUS` (24 tiles)
  finds nothing near a crowded anchor — it simply retries on the player's
  next connect instead; widening the radius is a tuning knob to revisit
  only if telemetry (step 3) shows this actually happening often.
