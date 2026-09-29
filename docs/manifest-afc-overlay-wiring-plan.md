# Manifest §10 step 10 — wire AFC + module 3D assets into both map renderers

Status: implemented (2026-09-28) on `agent/manifest-tech-data-cleanup` (PR #2085) -- kept as a historical design record; see docs/manifest-full-plan.md's progress report for the summary

Source: `docs/manifest-full-plan.md`'s progress report, "§10 step 10" section
— PR #2119 built the AFC socket overlay and 12 of 22 module overlays but
left them Storybook-only, wired into neither map renderer. This plan
covers wiring the AFC + those 12 modules into both renderers. The other 10
module overlays are being built on a separate PR/branch and are out of
scope here — this plan renders whatever a player's `tile.afc.modules`
actually contains, silently skipping (no socket instance) any tech id this
branch has no family overlay for yet, so those 10 modules "show up" for
free once that PR lands and adds their factories to the registry below.

## Current state (read from code, 2026-09-28)

- **True-3D renderer** (`packages/client/src/client-map-3d/client-map-3d.ts`,
  1818 lines — already over the 500-line cap, so this file's own net line
  count may not grow; every addition here must be offset): zero references
  to `tile.afc` or any of the 13 overlay files (`client-map-3d-fabrication-complex.ts`
  + 12 `client-map-3d-*-module.ts` files). An AFC tile currently renders with
  plain owner-color territory tint only — no building model at all (unlike
  a town, which gets `townOverlay.addInstance` keyed off `tile.town.populationTier`).
- **2D canvas renderer** (`client-runtime-loop.ts`, 1840 lines — also over
  the cap): same gap. No `drawAfc2D`-style function exists; nothing checks
  `tile.afc` in either of the two per-tile draw passes.
- **Overlay API contract** (confirmed identical across all 13 files):
  - `createFabricationComplexOverlay(scene, maxInstances, envMap?)` →
    `{ clear, addInstance(sceneX, sceneZ, surfaceY, worldTileX, worldTileY) => index, commit, update(nowMs), dispose, moduleSocketAttachments(index) => readonly AfcModuleSocketAttachment[] }`.
    `moduleSocketAttachments` returns up to `AFC_SOCKET_COUNT` (8) `{ socketIndex, x, y, z, yaw, bayInnerRadius }` records — scene-absolute
    positions/yaws for docking a module.
  - Every module overlay: `createXModuleOverlay(scene, maxInstances, envMap?)` →
    `{ clear, addInstance(sceneX, sceneZ, surfaceY, yaw, worldTileX, worldTileY) => index, commit, update(nowMs), dispose }`.
    Dock one at `att.x, att.z, att.y, att.yaw`.
  - `packages/storybook/src/3d/FabricationComplex.stories.ts`'s `buildAfc()`
    is a fully-working reference implementation of this exact wiring
    (construct AFC + all 12 module overlays, `addInstance` the AFC, iterate
    `moduleSocketAttachments`, dock a module per socket, `commit()` everything,
    push `update` into a shared per-frame loop) — copy its shape, not its
    demo-specific "alternate families for a screenshot" logic.
  - AFC spans a 3x3 tile footprint but is registered with **one** `addInstance`
    call on its center tile only; the geometry itself extends into the
    surrounding 8 tiles. Do not call `addInstance` for the 8 neighbors.
- **Data**: `Tile["afc"]` (`packages/shared/src/types.ts` /
  `packages/client/src/client-types.ts`) is
  `{ ownerId, status: "active"|"inactive", activatedAt?, modules?: string[] }`.
  `modules` is an unbounded array of AFC-Module tech ids in docking order
  (`afc-module-commissioning.ts` — no cap enforced server-side), but the
  asset only has 8 physical sockets. Render at most the first 8; anything
  beyond is a known, explicitly-documented limitation (not a bug to fix
  here — a socket-capacity redesign is out of scope).
- **12 covered tech ids → module family** (exact mapping the registry must
  encode; source: `tech-tree.json` + the storybook file's import list):

  | tech id | factory |
  |---|---|
  | `masonry` | `createTitaniumForgeModuleOverlay` |
  | `leatherworking` | `createRiggingWorksModuleOverlay` |
  | `crystal-lattices` | `createAetherResonanceModuleOverlay` |
  | `workshops` | `createUmbriteSynthesisModuleOverlay` |
  | `siegecraft` | `createSiegeLensFoundryModuleOverlay` |
  | `logistics` | `createTranspositionArrayModuleOverlay` |
  | `harborcraft` | `createAetherwardCoilModuleOverlay` |
  | `terrain-engineering` | `createGeoformEngineModuleOverlay` |
  | `navigation` | `createTidewayLatticeModuleOverlay` |
  | `aeronautics` | `createStratosphericDockyardModuleOverlay` |
  | `radar` | `createResonanceGridModuleOverlay` |
  | `matterwright-retort` | `createMatterwrightRetortModuleOverlay` |

## Implementation steps

### 1. Shared registry (new file, both renderers could use it, but only 3D needs the factories)
`packages/client/src/client-map-3d-afc-module-family/client-map-3d-afc-module-family.ts`:
- A `readonly Record<string, ModuleFamilyFactory>`-shaped table (or a
  `Map`) from tech id → that family's `createXModuleOverlay` function, per
  the table above. Exported so it's the single place a future PR adds the
  other 10 factories.
- A thin `AfcOverlayGroup` wrapper type/factory
  (`createAfcOverlayGroup(scene, maxAfcInstances, envMap?)`) that
  internally builds the AFC overlay + one instance of every family in the
  registry (capacity `maxAfcInstances * AFC_SOCKET_COUNT` each — generous
  but bounded, matching how other rare/singleton overlays in this codebase
  size their `InstancedMesh` capacity), and exposes exactly:
  - `clear()`, `commit()`, `update(nowMs)`, `dispose()` — fan out to the AFC
    overlay + all family overlays, so `client-map-3d.ts` calls 4 functions
    total instead of 14×4.
  - `addAfc(sceneX, sceneZ, surfaceY, worldTileX, worldTileY, moduleTechIds: readonly string[]): void` —
    calls the AFC's own `addInstance`, then for `moduleTechIds.slice(0, AFC_SOCKET_COUNT)`
    zipped with `moduleSocketAttachments(index)`, looks up the family in
    the registry and docks it (silently skips a tech id with no registry
    entry — see "10 modules missing" note above).
  This keeps `client-map-3d.ts`'s own diff to an import + one `const`
  + one call in each of its four existing multi-statement
  clear/commit/update lines + one new `if (tile?.afc)` branch — no net
  growth in that already-oversized file once folded onto its existing
  crammed-call-per-line convention (already used for ~15 other overlays'
  clear/commit/update calls on shared lines).

### 2. Wire into `client-map-3d.ts`
- Import `createAfcOverlayGroup` from the new file; construct it once
  alongside the other overlays (`atmosphere.buildingEnvironmentTexture`,
  same as every sibling factory).
- In the main per-tile loop, add `if (tile?.afc && terrain === "LAND") { afcOverlayGroup.addAfc(x, z, surfaceY, wx, wy, tile.afc.modules ?? []); contactShadowOverlay.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES); }`
  — do not also gate on `visibility === "visible"` if fogged/unowned AFC
  tiles should still show a silhouette the way towns do; match whatever
  the existing `tile?.town` branch actually does once re-read at
  execution time, don't assume.
- Add `afcOverlayGroup.clear()` / `.commit()` / `.update(nowMs)` onto the
  existing shared lines (not new lines).

### 3. 2D renderer parity
New `packages/client/src/client-map-2d-afc-overlay.ts` (or a directory
form matching the newer per-file convention, e.g.
`client-map-2d-afc-overlay/client-map-2d-afc-overlay.ts` — check which
convention this file family currently prefers before creating it),
mirroring `client-map-2d-watchtower-overlay.ts` exactly: a pure
`drawAfc2D(ctx, tile, px, py, size, nowMs)` canvas-vector function (no new
image assets — reuse the "riveted industrial" visual language already
established for watchtower, in the AFC's own brass/blackened-iron palette
described in `client-map-3d-fabrication-complex.ts`'s header comment).
Scope for 2D: draw one distinct AFC glyph so the tile reads as "not a
plain town" — matching this repo's established precedent (see the
Barbarian/"Bleed" changelog entry) that the 2D accessibility fallback is
allowed to be visually simpler than 3D (no per-module socket ring, no
docked-module glyphs) as long as that's stated plainly, not silently
absent. State this explicitly in the changelog entry, per AGENTS.md's
renderer-parity rule.

Wire the call into both existing per-tile draw passes in
`client-runtime-loop.ts` (lines ~456 and ~1036 today — re-locate at
execution time, these shift), gated the same way watchtower/waystation
are: `if (t && vis === "visible" && t.terrain === "LAND" && t.afc && !isTrue3DRendererActive()) drawAfc2D(...)`,
appended onto the existing shared line rather than a new one, for the
same already-oversized-file reason as `client-map-3d.ts`.

### 4. Tile menu title (small, optional but cheap parity win)
`client-tile-menu-title.ts` already special-cases AFC for its title text
— leave as is unless it also drives an icon/thumbnail elsewhere that
should now reflect the new art; check but don't scope-creep into the
AFC tile-overview UI backlog item (separate, not this task).

### 5. Tests
- New `client-map-3d-afc-module-family.test.ts` (or co-located): the
  registry resolves every one of the 12 known tech ids to a distinct
  factory, and returns `undefined`/no entry for an unknown id (e.g. one
  of the 10 not-yet-covered techs) rather than throwing.
- A focused `client-map-3d.ts`-adjacent regression test (matching the
  style of existing `client-map-3d-*-regression.test.ts` files) proving:
  an AFC tile produces one `afcOverlayGroup` AFC instance; a docked
  module tech id produces one instance in the matching family and zero
  in every other family; more than 8 docked modules doesn't throw and
  only docks 8; an unknown tech id in `modules` doesn't throw and docks
  nothing for that slot.
- A `client-map-2d-afc-overlay.test.ts` matching the existing
  `client-map-2d-watchtower-overlay`-style test shape (check for one if
  it exists as a template) proving `drawAfc2D` is a no-op when `tile.afc`
  is absent and draws when present, without needing to assert exact pixel
  output.

### 6. Changelog + docs
- Required changelog entry (AGENTS.md gate): state plainly that the AFC
  and its docked modules are now visible on the map in both renderers,
  that the true-3D renderer shows the full per-socket module ring while
  the 2D renderer shows a simpler distinguishing glyph only (per the
  renderer-parity rule — never let this read as full 2D/3D parity), and
  that only the 12 module families covered so far render (the remaining
  10 currently dock invisibly, matching prior behavior for all modules).
- Update `docs/manifest-full-plan.md`'s progress report once done: §10
  step 10 moves from "assets exist, unwired" to "AFC + 12 covered modules
  rendered in both renderers; 10 modules still visually unrepresented
  pending the other PR."

## Explicitly out of scope here
- The other 10 module overlays (separate PR, per user direction).
- Delivery animation (orbital streak/impact sequence) — §9/§10's later
  item, no gameplay currently waits on it.
- The AFC tile-overview UI backlog item — separate, presentation-only,
  does not depend on this work.
- Any change to the 8-socket cap or `afc.modules`'s unbounded length.
