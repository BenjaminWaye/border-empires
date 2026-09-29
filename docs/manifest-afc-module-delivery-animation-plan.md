# AFC module delivery animation — implementation plan

Status: planned (2026-09-29), not yet executed

Source: `docs/manifest-full-plan.md` §9 "3D delivery and overlay plan" →
"Delivery animation" (the orbital-streak/impact/reveal sequence spec) and
§10 step 10 ("Build delivery animation/overlay support" — still listed as
"not started" in the progress table alongside §4's "delivery events not
started"). Scope here is **only** the animation that plays when a Module
lands on an already-existing AFC — not the AFC's own first appearance
(that already renders immediately on spawn, shipped in the AFC 3D/2D
overlay wiring work), and not the §9 table's 19 module-specific bespoke
"power-on" visuals (explicitly deferred — see below).

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

## Explicitly out of scope here (Phase 2 backlog, not silently dropped)

- **Exact per-socket landing position.** Needs a new query on
  `AfcOverlayGroup` (something like `attachmentFor(worldTileX, worldTileY,
  techId): {x,y,z,yaw} | undefined`, populated during each `addAfc` call
  and read back by the FX-queue drain the same frame or the next) so the
  streak lands precisely where the module will sit rather than at the
  AFC's own center point.
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
