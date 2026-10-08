# AFC module delivery animation — implementation plan

Status: Phase 1 (Module delivery) implemented 2026-09-29 -- detector, 3D FX drain, 2D pulse, changelog; the join-time AFC drop (scope change 2026-09-30) is implemented -- see "Join drop" and its "Implementation status"; the mid-session AFC drop (tile-delta trigger) and Phase 2 backlog remain planned.

Source: `docs/manifest-full-plan.md` §9 "3D delivery and overlay plan" →
"Delivery animation" (the orbital-streak/impact/reveal sequence spec) and
§10 step 10 ("Build delivery animation/overlay support" — still listed as
"not started" in the progress table alongside §4's "delivery events not
started"). The main scope is the animation that plays when a Module
lands on an already-existing AFC. The whole-AFC arrival (a newly built
or granted AFC dropping from orbit) is covered separately in "AFC drop"
near the end of this doc. It reuses the same FX layer. The §9 table's
19 module-specific bespoke "power-on" visuals remain explicitly deferred
(see below).

## Current state (read from code, 2026-09-29)

- **Nothing plays today.** `commissionModuleIfApplicable`
  (`apps/simulation/src/afc-module-commissioning.ts`) auto-docks an
  AFC-Module tech onto the player's home AFC as a plain side effect of a
  successful `CHOOSE_TECH`, emitting an ordinary `TILE_DELTA_BATCH`. The
  client's per-tile rebuild loop (`client-map-3d.ts:1221`) already calls
  `afcOverlayGroup.addAfc(x, z, surfaceY, wx, wy, tile.afc.modules ?? [])`
  every time it re-populates the AFC/module `InstancedMesh`es, so a newly
  docked module's permanent geometry simply appears the next time the
  scene rebuilds — no transition, no feedback, exactly like any other
  already-existing module.
- **The `AfcOverlayGroup`/module-family system rebuilds from scratch, it
  doesn't hold persistent per-instance state.** `createAfcOverlayGroup`
  (`client-map-3d-afc-module-family.ts`) calls `afc.clear()` then
  re-`addInstance`s everything from current `tile.afc` state on every
  `maybeRebuild` (`client-map-3d.ts:914`'s `afcOverlayGroup.clear()` /
  `:1221`'s re-add). There is no stable identity for "this module
  instance, first seen at time T" to hang a pop-in tween off — this is
  the single biggest architectural constraint shaping the design below.
- **The exact trigger pattern already exists twice**, both worth copying:
  - `client-tile-delta-batch-handler.ts:58-76` snapshots each touched
    tile's *previous* state (`previousTileByKey`, `previousWaystationByKey`)
    **before** `applyGatewayTileDeltaBatch` merges the incoming delta, then
    a later pass (`:137-154`) compares `previous` vs. the now-merged
    `resolved` tile to detect a genuine transition — e.g. the "unsettle"
    block pushes `state.unsettleFxQueue.push({ x, y, queuedAt: nowMs })`
    the moment a same-owner SETTLED→FRONTIER transition is seen. This is
    the minimal version of the pattern I need.
  - `client-waystation-activation-detect.ts`'s
    `emitWaystationActivationIfActivated` is the richer version: it also
    guards against firing on a tile's *first-ever-seen* state (`if
    (previous?.activated) continue; // ...not a fresh transition (e.g. a
    boot resync)`) — critical, since `previous === undefined` only means
    "we had no snapshot for this tile before this batch," which includes
    both "genuinely new AFC" and "this tile just entered vision/a bulk
    resync." Reconnect goes through a separate `INIT` payload, not
    `TILE_DELTA_BATCH` (`client-network.ts:1174`'s "INIT resends each
    time" comment), so `handleTileDeltaBatchMessage` shouldn't normally
    see a bulk backfill here — but the same defensive guard (only fire
    when we already had a **non-undefined** previous-modules snapshot for
    this tile) costs nothing and removes the ambiguity either way.
- **The FX-queue-and-drain pattern is already established** for every
  one-shot 3D effect in the game: a `state.<name>FxQueue:
  Array<{x,y,queuedAt,...}>` field (`client-state.ts:241-257`), a
  `sync<Name>FxQueue()` drain function in
  `client-map-3d-fx-cast-overlays.ts` that shifts the queue and calls
  `layers.<name>Fx.spawn(sceneX, sceneZ, surfaceY, ...)`, and a
  self-contained FX layer (`create<Name>FxLayer(scene) => { spawn, update,
  clear, dispose }`) that tracks its own time-stamped entries and
  self-disposes once they age out. Two directly reusable references:
  - `client-map-3d-bombard-fx.ts` (`createBombardFxLayer`): impact
    ring+flash, then staggered rising/drifting smoke puffs, all pure
    functions of `age = nowMs - entry.startedAt`. This is stages 3-4 of
    §9's animation spec (impact cradle/dust/steam) almost verbatim.
  - `client-map-3d-popup-marine/popup-marine-strike-fx.ts`
    (`createBattleStrikeFxLayer`): a beam that races down from
    `BEAM_DROP_HEIGHT` onto the target tile over `STRIKE_LEAD_MS`, then
    the same impact-flash-and-ring beat. This is stages 1-2 (orbital
    streak, deceleration into impact) almost verbatim — and its own header
    comment is the established precedent for "true-3D renderer only, 2D
    has no equivalent, documented as a scope decision" (`popup-marine-overlay-fx.ts:31-35`),
    directly citable for this plan's own renderer-parity call.
- **AFC's own module-socket geometry** (`client-map-3d-fabrication-complex.ts`):
  `moduleSocketAttachments(index)` returns up to `AFC_SOCKET_COUNT` (8)
  scene-absolute `{socketIndex, x, y, z, yaw, bayInnerRadius}` records —
  the precise per-socket landing spot for a docked module. This is private
  to `createAfcOverlayGroup`'s closure today; nothing outside it can ask
  "where exactly does module tech id X sit on AFC tile (wx,wy) this
  frame." Getting exact per-socket landing coordinates into the FX layer
  needs a small new query surface (see Phase 2 below) — Phase 1 sidesteps
  this entirely (see Design decisions).
- **2D**: `drawAfc2D` (`client-map-2d-afc-overlay.ts`) already computes a
  `pulsePhase` from `nowMs` driving the reactor core's brightness — no
  module-level detail exists or is planned for 2D (established in the AFC
  tile-overview session's own work: "it does not show individual docked
  modules... since it has no equivalent per-instance model system").

## Design decisions (and why)

1. **Trigger: tile-delta diff, owner-only, no reconnect replay.** Not an
   optimistic client-side push on `CHOOSE_TECH` (the pattern
   `astralDockLaunchFxQueue`/`worldEngineStrikeFxQueue` use) — those work
   because the acting player's own click already knows the exact target
   tile. Module commissioning doesn't: the destination is server-resolved
   (`homeAfcTileKey` — earliest `activatedAt`, tie-broken by tile key), so
   the client would have to duplicate that resolution logic speculatively
   and could still guess wrong (e.g. the player's "home" AFC changed
   because their original one was captured). Diffing the authoritative
   `TILE_DELTA_BATCH` the server already sends is correct by construction
   and needs zero new wire types. No missed-animation replay after
   reconnect: per §9's own text ("the animation is presentation only"),
   this is a pure cosmetic flourish, not a fact worth resurrecting from
   history the way a Waystation's one-time reward is.
2. **Landing position: AFC tile-center in Phase 1, not the exact socket.**
   `moduleSocketAttachments` isn't queryable outside `createAfcOverlayGroup`
   today, and the group is rebuilt from scratch every frame with no
   stable per-instance identity to correlate "this delivery FX" with "that
   socket, on that rebuild." Landing the streak at the AFC's own
   `addInstance` position (already available from the FX queue's `{x,y}`
   via the same `sceneXZ`/`aetherBridgeTileSurfaceY` helpers every other
   `sync*FxQueue` function already uses) is materially simpler, ships
   sooner, and is still a legible "something arrived at your AFC" beat —
   §9 frames the delivery as landing "into the AFC" as a whole complex,
   not as demanding pixel-perfect per-socket precision. Exact per-socket
   landing is Phase 2 (below).
3. **The module's permanent geometry keeps appearing instantly — no
   pop-in tween in Phase 1.** Tweening an individual `InstancedMesh`
   instance's scale over time needs a stable per-instance identity across
   frames; the current rebuild-every-frame architecture has none. Rather
   than reworking `AfcOverlayGroup` into a persistent-instance model
   (a much larger, riskier change) just to get a scale-up pop, Phase 1
   accepts the module appearing at full size immediately underneath the
   FX, and relies on the FX's own impact flash/dust to visually mask that
   pop the same instant it happens — which is what real "instant apply,
   animation is cosmetic" implementations of this kind of effect usually
   do anyway (compare: the AFC's own dust/steam already covers its socket
   the moment a module's mesh pops in during ordinary rebuilds today).
4. **One shared, generic delivery FX for every module family in Phase 1
   — not 19 bespoke ones.** §9's "Major module visuals" table (furnace
   drums, lens presses, neural vats, ...) and "module-specific lights,
   pipes, coils, or machinery animate online" is real, valuable polish,
   but it's a 19-item content backlog on its own, disproportionate to
   land in the same change as the delivery mechanism itself. Phase 1
   ships one shared `createAfcModuleDeliveryFxLayer` (streak + impact +
   dust + a brief warm reveal-glow at the landing point) usable for every
   module tech id uniformly — matching how `createBombardFxLayer`/
   `createBattleStrikeFxLayer` are already shared, context-generic
   effects, not bespoke per-thing ones. Per-module visual identity stays
   Phase 2 backlog (tracked below, not silently dropped).
5. **2D gets a cheap companion pulse, not a skipped renderer.** A full
   per-module 3D sequence has no 2D equivalent to speak of (2D doesn't
   render individual modules at all) — matching the already-shipped,
   already-justified precedent (`popup-marine-overlay-fx.ts`'s "true-3D
   only" note) is a legitimate option under AGENTS.md's renderer-parity
   escape hatch. But `drawAfc2D` already computes a pulsing core glow for
   free, so a *free* low-cost gesture exists: briefly boost that pulse's
   brightness/radius for ~1.2s when a delivery lands, driven by the same
   FX queue. This isn't "the animation," it's a visible acknowledgment
   that something happened — cheap enough to include in Phase 1 rather
   than deferred, and it keeps this branch from reading as "2D silently
   gets nothing" even though the rich sequence genuinely is 3D-only.

## Implementation steps (Phase 1)

### 1. State
`client-state.ts`: add
`afcModuleDeliveryFxQueue: [] as Array<{ x: number; y: number; techId: string; queuedAt: number }>,`
next to the existing FX queue fields (`:241-257`).

### 2. Detection — `client-tile-delta-batch-handler.ts`
- In the existing pre-merge snapshot loop (`:58-76`, alongside
  `previousTileByKey`/`previousWaystationByKey`), add
  `previousAfcModulesByKey: Map<string, ReadonlySet<string> | undefined>`,
  populated as `existing?.afc?.modules ? new Set(existing.afc.modules) : undefined`.
- In the existing post-merge per-update loop (`:137-154`, the same one
  that pushes `unsettleFxQueue`), add: for a `resolved` tile with
  `resolved.afc && resolved.ownerId === state.me`, look up
  `previousAfcModulesByKey.get(updateKey)`; **skip entirely if that's
  `undefined`** (first-ever-seen snapshot for this tile — not a fresh
  transition, same guard rationale as the waystation detector); otherwise
  push one `afcModuleDeliveryFxQueue` entry per tech id present in
  `resolved.afc.modules` that wasn't in the previous `Set` (handles the
  rare case of more than one module landing in the same batch — unlike
  the waystation popup, there's no "cap at one per batch" reason here
  since this is an ambient background effect, not a blocking modal).
- New regression test alongside the existing waystation-detect tests
  (check `client-waystation-activation-detect.test.ts` for the exact
  harness shape to mirror): a batch touching an owned AFC tile whose
  `modules` gained a new tech id queues one entry; a batch where the tile
  is seen for the first time (no previous snapshot) queues nothing; a
  batch for another player's AFC queues nothing; two new modules in one
  batch queue two entries.

### 3. New FX layer — `client-map-3d-afc-module-delivery-fx.ts`
`createAfcModuleDeliveryFxLayer(scene): { spawn(sceneX, sceneZ, surfaceY, nowMs), update(nowMs), clear(), dispose() }`,
composed from the two existing references rather than written from
scratch:
- **Descent** (borrow `popup-marine-strike-fx.ts`'s beam-drop shape,
  recolored — a warm amber/brass streak with a bright core, not the
  battle system's violet/cyan, to read as "cargo," not "weapon fire"):
  races down from a drop height onto the landing point over some lead
  time (name it `DELIVERY_LEAD_MS`, tune by eye — §9 doesn't specify an
  exact duration beyond "no gameplay should wait," so this is a pure
  presentation constant).
- **Impact** (borrow `bombardFx`'s hit-ring + flash, same
  additive-blended `RingGeometry`/`CylinderGeometry` shapes, brass/amber
  palette).
- **Dust/steam** (borrow `bombardFx`'s smoke-puff rise-and-drift, same
  shape, lower opacity ceiling to read as steam vents rather than
  battlefield smoke).
- **Reveal glow** (new, small addition): a brief warm point-light-like
  sprite or additive sphere at the landing point that fades in with the
  impact and lingers ~400-600ms longer than the dust, standing in for
  "module-specific lights animate online" in a generic, module-agnostic
  way per Design decision 4.
- Same `entries: Array<{ startedAt, ... }>` / age-driven `update(nowMs)` /
  self-dispose-when-aged-out structure as `bombardFx`, so it's inert (no
  per-frame branching cost) once its short entries list empties.
- Unit test mirroring `client-map-3d-bombard-fx`'s own test shape (check
  for one; if none exists, this file's own manual/visual verification
  via the Storybook story in step 6 may be the only coverage — matches
  this codebase's established precedent that pure-visual FX timelines are
  often verified by story + eyeballing rather than assertions on mesh
  transforms).

### 4. Wire into the renderer — `client-map-3d.ts` + `client-map-3d-fx-cast-overlays.ts`
- `client-map-3d-fx-cast-overlays.ts`: add `syncAfcModuleDeliveryFxQueue()`
  following the exact shape of `syncWorldEngineStrikeFxQueue`/`syncUnsettleFxQueue`
  (`:168-197`): drain `state.afcModuleDeliveryFxQueue`, resolve
  `sceneXZ(entry.x, entry.y)`, call
  `layers.afcModuleDeliveryFx.spawn(sceneX, sceneZ, aetherBridgeTileSurfaceY(entry.x, entry.y) + MARKER_RISE_ABOVE_HEIGHTFIELD, performance.now())`.
  Export it from the same `FxCastOverlaysDeps`-shaped return object the
  other `sync*FxQueue` functions already live on.
- `client-map-3d.ts`: construct `const afcModuleDeliveryFx = createAfcModuleDeliveryFxLayer(scene);`
  alongside the other FX layers; add `.clear()`/`.dispose()` onto the
  existing shared lines (`:914`, `:1759` are `afcOverlayGroup`'s own —
  find the nearest FX-layer shared line, e.g. wherever `bombardFx`/
  `siegeBombardFx` clear/dispose, and append there instead, matching that
  category rather than the structural-overlay category `afcOverlayGroup`
  belongs to); add `syncAfcModuleDeliveryFxQueue();` next to the other
  `sync*FxQueue()` calls (near `:1650`'s `syncWorldEngineStrikeFxQueue()`);
  add `.update(nowMs)` onto the shared FX-update line. Watch the file's
  line budget the same way the AFC overlay-wiring branch did (it's grown
  since — recheck `wc -l` before editing; if it's within a few lines of
  500 again, route new calls onto existing shared lines rather than new
  ones, exactly as that branch did for `renderReachOverlay3DPylons`).

### 5. 2D companion pulse — `client-map-2d-afc-overlay.ts` + `client-runtime-loop.ts`
- Extend `drawAfc2D`'s signature with an optional `deliveryPulseT?:
  number` (0..1, or simplest: `deliveryActiveUntilMs?: number` compared
  against `nowMs`, matching the FX layer's own age-based style) that
  boosts `pulsePhase`'s amplitude/radius for that window.
- `client-runtime-loop.ts`'s two per-tile 2D draw call sites (the ones
  already gating `drawAfc2D` on `t.afc && !isTrue3DRendererActive()`)
  need a cheap way to know "is tile (x,y) within an active delivery
  window" — reuse the same `state.afcModuleDeliveryFxQueue` idea, but
  since 2D's draw loop runs every frame and the 3D FX queue gets drained
  (shifted out) by the 3D sync function, 2D needs its own small
  lookup that doesn't depend on the 3D renderer having run. Simplest:
  keep a tiny separate `Map<string, number>` (tile key → delivery-landed
  timestamp) that BOTH the 2D and 3D paths read from — populate it in the
  same detection step (2) alongside the queue push, keyed by
  `keyFor(x,y)`, pruned lazily (drop entries older than the pulse window
  when read). This avoids coupling 2D's presence to whether the 3D FX
  queue was drained first.

### 6. Storybook
New `packages/storybook/src/3d/AfcModuleDeliveryFx.stories.ts` (matching
this session's own `AfcModuleOverview.stories.ts` precedent of calling
real production code, not a mock): construct the real
`createAfcOverlayGroup` + `createAfcModuleDeliveryFxLayer`, dock an AFC
with a couple of pre-existing modules, then a button that calls
`afcModuleDeliveryFx.spawn(...)` on click to replay the sequence on
demand — the natural way to eyeball-verify a several-second timed
animation without needing the full game running.

### 7. Changelog + docs
- Changelog entry (AGENTS.md gate): plain-language description —
  "researching an AFC Module now shows a short delivery animation (a
  cargo streak descends and lands at your AFC) in the true-3D renderer;
  the 2D renderer gets a brief brightness pulse on the AFC glyph instead,
  since it has no per-module visuals to animate."
- Update `docs/manifest-full-plan.md`'s progress table (§10 step 10 row)
  and §4's row once shipped: delivery events / delivery animation move
  from "not started" to done-for-the-shared-mechanism, with the Phase 2
  per-module-visual backlog noted as still open (don't let this read as
  "§9's full table is done" — it isn't).

## AFC drop: a whole AFC arriving (added 2026-09-29)

Needed by `docs/manifest-full-plan.md` §4 "Building additional AFCs": when
a player buys an AFC and picks its landing tile, the AFC should visibly come
down from orbit onto that tile. The same animation also covers every other
way an AFC appears on a tile the viewer can already see:

- the pre-AFC migration grant (PR #2150);
- an elimination-respawn in view;
- **the player's own home AFC when they join a season** (scope change
  2026-09-30, see "Join drop" below). This is the player's first sight of
  their empire, so it is the slowest and most deliberate variant.

Every AFC arrival uses the same effect; the join drop is a slower preset of
it, and it does not start until the player is looking at the map.

### Sequence (~3 s total, presentation only; the server applies the AFC instantly)

1. **Re-entry** (~1200 ms). A real AFC model descends from drop height
   onto the tile, wrapped in the module drop's white-hot-to-amber streak
   (`makeStreakTexture`, vertical-gradient cylinder). The streak is
   scaled up, and the descent is slower than a module's 700 ms because
   this is a whole structure.
2. **Braking burn** (last ~350 ms of the descent). This is the one new
   element. A downward thruster flare under the hull, built from the glow
   sprite already in the FX file (`makeGlowTexture`), tinted hot, and
   eased so the model visibly slows before touchdown. Modules have no
   braking burn; they slam in.
3. **Touchdown.** The module drop's impact flash and shockwave ring, then
   its smoke puffs with a larger `SMOKE_SPREAD_RADIUS`/`SMOKE_PUFF_COUNT`
   so the cloud swallows the whole tile (the same "covered in smoke"
   tuning the user asked for on the module drop).
4. **Power-on.** As the smoke thins, the reveal glow pulses, the
   descending copy is removed, and the normal AFC overlay takes over at
   the same spot.

### Design decisions

1. **Trigger: tile-delta diff, same as module delivery.** In
   `client-tile-delta-batch-handler.ts`, fire when a tile we already had
   a snapshot of had **no** `afc` before the batch and has one after.
   Tiles seen for the first time never fire, per the same guard as
   Design decision 1 above. A player's own initial spawn arrives via
   `INIT`, not a delta, so this detector never sees it. **Superseded
   2026-09-30:** the join-time drop is now in scope and uses its own
   trigger and gate (see "Join drop"). Reconnects and returning players
   are still deliberately not replayed.
   - **Visible to every viewer, not owner-only.** Unlike a module
     docking, an AFC dropping onto the map is a public event. Anyone
     with the tile in vision sees it, which is also what makes the
     "spread risk" choice legible to rivals.
2. **Hide the real AFC until touchdown.** This is the one real
   architectural point. Both renderers draw AFCs every frame straight
   from `tile.afc`, so the finished AFC would pop in the instant the delta
   lands, before the descent starts.
   - Add a small, bounded `state.afcArrivalsByKey: Map<tileKey,
     landsAtMs>`, written by the detector.
   - While `nowMs < landsAtMs`, both the 3D rebuild loop (the
     `afcOverlayGroup.addAfc` call) and the 2D `drawAfc2D` call sites in
     `client-runtime-loop.ts` skip that tile's AFC.
   - Entries are deleted once the drop ends (lazily on read, plus on the
     FX layer's `clear()`), so the map can never grow unbounded
     (`docs/agents/state-and-persistence-discipline.md`).
3. **The descending model is a separate single instance.**
   `createFabricationComplexOverlay(scene, 1)` (the same factory the
   Storybook story already uses) is owned by the FX layer, with its
   instance matrix's Y animated per frame. Don't try to animate the
   shared `AfcOverlayGroup` instance, for the same no-per-instance-identity
   reason as Design decision 3 above.

### Join drop: the player's own AFC on entering a season (scope change 2026-09-30)

Reported gap: a player joining the game sees no landing animation for
their AFC. The AFC drop was planned only for AFCs appearing mid-session,
and the join case was explicitly excluded. It is now in scope, with one
overriding requirement: **the animation is slow and deliberate, and it
plays only once the player has got through every dialog and popup and
their eyes are on the map.** A drop that plays behind a modal is wasted,
and one that fires the instant a modal closes is missed.

#### When it plays: the "eyes on the map" gate

The drop is *armed* as soon as the viewer's own freshly activated home AFC is seen (from `INIT`, a chunk or a delta alike) and *started* only when the gate is open.
The gate is a single shared predicate, `isMapUnobstructed(state)`, in
its own small module. It reuses the exact set of blockers that
`shouldShowRendererPrompt` (`client-runtime-loop.ts`) already checks, so
there is one definition of "the player can see the map" instead of two,
and adds the blockers that check misses:

- `state.authSessionReady` and `!state.profileSetupRequired` (auth /
  name-and-colour setup; `#auth-overlay` is hidden only when both hold,
  `client-auth-ui.ts`);
- `!state.changelog.open` (a new player has `seenAt === 0`, so the
  changelog auto-opens);
- `!state.guide.open` (the tutorial auto-opens until
  `GUIDE_STORAGE_KEY` is `"1"`);
- `!state.activityDashboard.open`;
- **not in the existing check, must be added:**
  `!(state.needsSeasonJoin && state.joinSeasonOverlayOpen)` (join-season
  lobby overlay, which goes full-screen), `!state.respawnOverlayOpen`, and
  the season-end overlay.

Non-blocking UI does **not** gate: the discovery-tip corner toast and the
onboarding-checklist bubble sit at the screen edges and do not cover the
map centre where the AFC lands.

On top of the overlay check the gate also requires, all at once:

1. **Frame is real.** `state.connection === "initialized"`, the initial
   tile snapshot is applied (`state.firstChunkAt > 0`), and the 3D
   renderer has drawn at least one frame with the home tile's terrain
   (or the 2D canvas has, on the fallback path).
2. **Tab is visible** (`document.visibilityState === "visible"`).
   `requestAnimationFrame` stops in background tabs, and a join drop
   played in one is silently lost.
3. **The AFC tile is on screen.** New players get the camera snapped to
   the home tile at `INIT`, but check anyway: if the camera has moved so
   the AFC tile is outside the viewport, wait; do not steal the camera.
4. **A dwell.** All of the above must have held continuously for
   ~1200 ms. This absorbs the modal fade-out, so the drop does not fire
   on the same frame the player clicked "Get Started", while their
   attention is still on the button. The dwell is the "eyes on the map"
   beat; nothing animates during it.

If the gate closes during the dwell, the dwell restarts. Once the drop
has *started* it is not paused by a modal that later opens, because by
then every auto-opening dialog has already been dismissed and any new one
is player-initiated. Note this as an accepted limitation. It also does
not cancel on input: the player can pan and click while it plays, and the
effect stays anchored in world space.

**Safety net.** The gate has a very long fallback (5 minutes of the tab
being visible with some overlay still open, `AFC_JOIN_FALLBACK_REVEAL_MS`)
after which the AFC is simply revealed with no animation and the "played"
flag is set. It is deliberately far longer than anyone needs to read the
changelog and tutorial, so it never cuts a real player's animation; it
exists only so a stuck overlay flag can never leave the AFC permanently
invisible.

#### Hold the real AFC hidden until the drop lands

This extends Design decision 2. For the join drop the AFC exists from the
first frame, so it would otherwise sit visibly on the map under the
dialogs, then vanish and re-land. Instead a small `state.afcJoinDrop`
record (phase, tile, timestamps; a fixed-size scalar record, so nothing
growable) carries the hold:

- While the phase is `waiting`, or `playing` before touchdown, both
  renderers skip the AFC on that tile (`isAfcHiddenForJoinDrop`): 3D at
  the `addAfc` call, 2D in `drawAfcTile2D`.
- The tick bumps the tile revision (and records the changed key) when it
  arms and again when it reveals at touchdown, so the 3D renderer
  rebuilds its instances exactly then.
- Every exit path (completion, safety-net reveal, AFC replaced) sets
  `revealed`, so the hold can never outlive the drop.

#### Once only

The trigger is the AFC itself, not the join flow. This replaced an earlier
idea (arm on the first `INIT` after the client observed the join flow),
which missed most real paths: a fresh player joins through the lobby's
"Let's go!" (`JOIN_SEASON_ACK`), and the AFC then arrives in a chunk or
delta, with no second `INIT`.

- The server stamps a spawn AFC with `activatedAt = ctx.now()`
  (`apps/simulation/src/runtime-respawn-helpers.ts`). The client arms the
  drop when the tile at `state.homeTile` carries an AFC owned by the
  viewer whose `activatedAt` is at most 30 minutes old
  (`AFC_JOIN_MAX_AGE_MS`). A returning player's old AFC is never that
  young, so nothing replays for them, including on the rollout of this
  feature. An elimination-respawn gets a new AFC with a new `activatedAt`,
  so it drops again.
- "Already played" is persisted when the drop *completes* (or the safety
  net reveals), via the server-synced discovery-tip storage the Space
  welcome letter uses (`isDiscoveryTipSeen` / `markDiscoveryTipSeen`).
  The tip id is `AFC_JOIN_DROP_<activatedAt>`: unique per AFC, so a new
  season or a respawn plays once each, and the 30-day tip TTL prunes old
  ids. The gateway stores `dismissedHints` as an open string list, so no
  id allow-list needed updating.
- A player who reloads mid-animation replays it (nothing was persisted)
  as long as the AFC is still under 30 minutes old. A player who reloads
  after the animation finished does not.
- If the AFC is replaced while waiting or playing (respawn, new season),
  the controller stands down without marking anything played, reveals the
  old one, and arms for the new one on the next frame.

#### The join preset: slow and deliberate

Actual values (`client-afc-join-drop-timeline.ts`, tuned in Storybook by
scrubbing the timeline; the story owns its clock and has a slider):

| Beat | Duration | What the player sees |
| --- | --- | --- |
| Settle dwell | 1200 ms | Nothing. Gate held open; the map is still. |
| Full burn | 0-1700 ms | AFC comes in from orbit inside the module drop's streak (fades in over the first 500 ms so it is seen *coming*), thrusters at full power under the hull, braking hard. Clip: the bright opening roar. |
| Wind-down | 1700-6350 ms | Thrust (cone, glow, ground scour) tapers to a low idle as the AFC slows to a near-hover just above the ground; the streak burns off. Clip: the roar's pitch falling. |
| Engine cut | 6350-7150 ms | Thrusters off; the AFC drops the last few percent unpowered and hits the ground. Clip: the short lull. |
| Touchdown | at 7150 ms; ~260 ms flash, 1600 ms shockwave | Impact glow, thin ring, expanding shockwave. Clip: the sharp impact hit. |
| Smoke settle | ~1900 ms per puff, staggered | A soft dust bank (gradient sprites, not solid spheres) wraps the 3x3 footprint, then thins. Clip: the low ground rumble. |
| Power-on | 1000-2600 ms after touchdown | Cyan glow swell as the smoke thins. The real AFC is revealed at touchdown under the smoke; the descending copy lingers 800 ms to cover rebuild throttling. |

That is 10 s of animation after the 1.2 s dwell. The beats are pinned to
the 9 s rocket clip (`/audio/afc-drop-rocket.mp3`) that plays as the drop
starts (constants in `client-afc-join-drop-timeline.ts`); the smoke
finishes settling about a second after the clip ends. The join drop is the
only preset built so far; a mid-session drop (brisker, ~3 s, no dwell)
would be a second preset over the same layer.

**Onboarding checklist: not held (deferred).** The checklist's first-time
auto-open is a corner card that does not cover the map centre, and it is
rendered only from the tile-delta path with no hook to re-render when the
drop ends, so holding it would need new plumbing for little gain. Revisit
only if it proves to distract during touchdown.

#### Renderer parity

Per AGENTS.md, both renderers must be covered in the same branch.

- **True-3D:** the full descent, braking burn, impact and smoke.
- **2D fallback:** the join drop uses the same gate, the same hold-hidden
  behaviour and the same timeline, with the simpler 2D companion: a slow
  shrinking target ring for the descent, then the touchdown flash and
  dust ring, then power-on glow. The 2D timings use the join preset too,
  so a player on the fallback path gets the same unhurried beat.
  Before calling this done, grep `isTrue3DRendererActive()` and confirm
  both branches were touched.

#### Implementation status (2026-09-30)

Implemented (all in `packages/client/src`):

- `client-afc-join-drop/`: timeline constants and easing, the state
  machine (`tickAfcJoinDrop`), per-frame wiring
  (`tickAfcJoinDropForFrame`, called from `client-runtime-loop.ts` before
  either renderer draws), and the 2D companion (`drawAfcTile2D`).
- `client-map-unobstructed/`: `isMapUnobstructed(state)`, the shared
  "eyes on the map" predicate.
- `client-map-3d-afc-drop-fx/`: the true-3D layer, with a private
  descending AFC model, streak, braking burn, touchdown and smoke.
- Hidden-until-touchdown: `client-map-3d.ts` skips `addAfc` while
  `isAfcHiddenForJoinDrop`, and the tick bumps the tile revision on arm
  and reveal so the 3D renderer rebuilds; `drawAfcTile2D` draws nothing
  while waiting. (Implemented as `state.afcJoinDrop`, not the
  `afcArrivalsByKey` map sketched under "AFC drop" Design decision 2.)
- Storybook: `AfcDropFx.stories.ts` (real FX layer, scrub slider).
- Changelog entry.

Deliberately not built, and why:

- **The mid-session AFC drop** (tile-delta detector for a bought AFC,
  another player's AFC, elimination-respawn in view). Nothing produces
  those events yet (the build-AFC command and picker are still open), so
  a detector would be dead code. The FX layer and gate are reusable when
  it lands; it would add a brisker preset (~3 s, no dwell).
- **`shouldShowRendererPrompt` refactor** onto `isMapUnobstructed`. It
  takes a differently shaped input and is also used by the HUD; left
  alone to keep this change small.
- **Onboarding checklist hold** (above).
- **Audio.** No cue was added.

### Implementation steps

1. **State.** `client-state.ts`:
   - `afcDropFxQueue: [] as Array<{ x; y; queuedAt }>` next to the other
     FX queues.
   - `afcArrivalsByKey: new Map<string, number>()`;
   - `afcJoinDropPending: boolean` and `afcJoinDropGateSince: number`
     (0 when the gate is closed; the timestamp the dwell started
     otherwise). Both are plain scalars, so nothing growable is added.
2. **Detection.** In the existing pre-merge snapshot loop of
   `client-tile-delta-batch-handler.ts`, record `hadAfc` for each touched
   tile. In the post-merge loop, fire on `hadAfc === false && resolved.afc`,
   pushing a queue entry and setting `afcArrivalsByKey`. Regression tests
   next to the module-delivery detector's:
   - fires on a fresh AFC;
   - no fire for a first-seen tile;
   - no fire when the tile already had an AFC (module change only);
   - fires for another player's AFC too.

   Join-drop tests, next to the new gate module:
   - armed on the first `INIT` after the join flow, not on a reconnect
     `INIT`, and not for a returning player who never saw the join flow;
   - gate stays closed for each blocker in turn (auth, profile setup,
     changelog, guide, activity dashboard, join-season overlay, respawn
     overlay, season-end overlay, hidden tab, AFC tile off screen);
   - gate must hold for the full dwell, and the dwell restarts if a
     blocker reappears part-way;
   - the drop starts only after the dwell, and the hidden-AFC sentinel is
     replaced by the real landing time at that moment;
   - safety net reveals the AFC with no animation after the long timeout;
   - the "played" flag is written on completion and not before, so an
     abandoned session can replay it;
   - the `Infinity` sentinel is cleared on completion, disconnect and
     season change.
3. **FX.** Extend `client-map-3d-afc-module-delivery-fx.ts`:
   - Parameterize the streak, smoke, and duration constants into a
     preset (`MODULE_DROP` vs. `AFC_DROP` vs. `AFC_JOIN_DROP`).
   - Add the braking-burn sprite and the descending single-instance AFC
     model.
   - Recheck `wc -l` first (the file is ~350 lines). If the AFC variant
     pushes it past 500, put the AFC-specific parts in
     `client-map-3d-afc-drop-fx.ts` and share the texture helpers.
4. **3D wiring.** Add a `syncAfcDropFxQueue()` in
   `client-map-3d/client-map-3d-fx-cast-overlays.ts`, following the other
   `sync*FxQueue` drains, plus the construct/update/clear/dispose calls
   in `client-map-3d.ts` on existing shared lines (that file is far over
   the 500-line cap, so net growth must be zero). Also add the
   `afcArrivalsByKey` skip at the `addAfc` call.
5. **2D companion**, required for renderer parity:
   - During the descent, draw a shrinking target ring on the tile.
   - At touchdown, a white-to-amber flash and an expanding dust ring.
   - Then `drawAfc2D` resumes normally, since the `afcArrivalsByKey`
     skip has lapsed.
   - Draw it from `client-map-2d-afc-overlay.ts` (84 lines, room to
     grow), called at the same `client-runtime-loop.ts` sites.
6. **Storybook.** Add an "AFC drop" story beside
   `AfcModuleDeliveryFx.stories.ts` with a "Replay drop" button and a
   preset switch (mid-session vs. join). Tune durations there before
   wiring into the game, as with the module drop; the join preset's
   pacing in particular can only be judged by watching it. The story
   renders the real FX layer, not a mockup.
7. **Join gate and arming.** New module (its own file, well under the
   500-line cap) exporting `isMapUnobstructed(state)`, the arm-at-`INIT`
   step in `client-network-init-message.ts` (a call into the new module,
   not new logic in that file), and a per-frame gate tick from
   `client-runtime-loop.ts` that starts the drop when the dwell
   completes. Both `client-network-init-message.ts` and
   `client-runtime-loop.ts` are large, so check `pnpm check:file-lines`
   and extract before adding anything net-positive. Refactor
   `shouldShowRendererPrompt`'s call site to use `isMapUnobstructed` too,
   so there is one definition of "map visible".
8. **Changelog** is shared with the build-AFC feature's entry. There is no
   separate entry unless the animation ships on its own branch first.
   The join drop *is* user-visible, so if it ships on its own branch it
   needs its own `CLIENT_CHANGELOG_ENTRIES` entry.

## Follow-up status (updated 2026-09-29)

- **Exact per-socket landing: implemented.** Rendered module families expose
  their current socket through `AfcOverlayGroup`; the 3D delivery queue uses
  it, while families without 3D art retain a centre-of-AFC fallback.
- **Additional-AFC price curve: implemented as shared logic.**
  `afcBuildCost(ownedAfcCount)` derives the 290 Coin anchor from the ninth
  tech price and doubles for every AFC already owned. The command, picker,
  and whole-AFC arrival remain open.

## Explicitly out of scope here (remaining Phase 2 backlog)

- **Per-module bespoke "power-on" visuals** — the §9 table's 19 visual
  directions (furnace drums, lens presses, neural vats, coil arcs, ...).
  Natural follow-up once the shared mechanism ships and the team has a
  feel for how much per-module art is worth the investment.
- **A true geometry pop-in/unfold tween** on the module's own permanent
  mesh, instead of appearing instantly underneath the FX. Needs
  `AfcOverlayGroup` reworked toward some form of persistent per-instance
  state across rebuilds — a materially larger architectural change,
  evaluate only if the "instant pop + FX mask" approximation reads as
  unsatisfying in practice.
- **Reconnect/catch-up replay** of a missed delivery animation — a
  deliberate scope decision (Design decision 1), not an oversight.
- **Aether Resonance Core "progressive transformation"** — §9's closing
  note that Aether-branch cartridges should visibly build up the shared
  Core rather than spawn separate overlays. That's a structural change to
  how Aether-family modules dock (today each still gets its own
  `ModuleFamilyOverlay` instance per `client-map-3d-afc-module-family.ts`'s
  registry), not something the delivery *animation* alone can retrofit —
  flagging it here since it's easy to conflate with this plan, but it's
  really a Phase 2/3 rework of the Aether module family's own rendering,
  independent of whether deliveries animate.
