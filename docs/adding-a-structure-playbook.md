# Playbook: adding a new buildable structure

Adding one new building touches ~17-22 files across `packages/shared`,
`packages/game-domain`, `apps/simulation`, and `packages/client`. This is a
checklist for doing it completely in one pass, derived from actually adding
the Weapons Workshop (`WEAPONS_WORKSHOP`, PR #1188), and amended after two
real, shipped bugs (#1253/#1265, #1275 — see steps 10 and 11) where a
structure was buildable everywhere *except* through the actual click path.
Skipping any of the "required" items either breaks the build, leaves the
structure un-buildable, or ships it with a broken/missing UI.

Pick a `SCREAMING_SNAKE_CASE` type name up front (e.g. `WEAPONS_WORKSHOP`) —
every step below keys off it.

## 1. Type union (required)

`packages/shared/src/types.ts` — add the new type to `EconomicStructureType`.
Every other union in the codebase that needs to represent this structure
either derives from this one or duplicates a subset of it (see step 8).

## 2. Build cost (required)

`packages/shared/src/structure-costs/structure-costs.ts` — add an entry to
`STRUCTURE_COST_DEFINITIONS`: `baseGoldCost` (almost always `0` — gold-only
build costs were retired, see the comment at the top of that file),
`manpowerCost`, and optionally `resourceCost`/`scaling`. Note `resourceCost`
here is legacy/mostly unused for FOOD/IRON/CRYSTAL/SUPPLY — the real
resource cost is the slot requirement in step 3.

## 3. Resource slot requirement (required if the structure consumes a resource)

`packages/shared/src/structure-slots/structure-slots.ts` — add an entry to
`STRUCTURE_SLOT_REQUIREMENTS`: an array of `{ resource, count }`. This is
what actually gates the build (`hasFreeResourceSlots`) and determines
dormancy (a structure with no free slot of its required resource goes
dormant and stops granting its effect).

## 4. Tech gate + registry entry (required)

`packages/shared/src/structure-registry-economic.ts`:
- Add `<TYPE>: "<tech-id>"` to `TECH_REQUIREMENTS_BY_STRUCTURE` (omit if the
  structure should have no tech gate, like Wooden Fort/Relay Beacon).
- Add `<TYPE>: econSpec("<TYPE>")` to `ECONOMIC_SPECS` (pass `{ upkeep, buildMs }`
  as the second arg if it needs non-default upkeep or build time).

If the structure needs a brand-new tech rather than reusing an existing one,
add it to `packages/game-domain/data/tech-tree.json` too (see step 12).

## 5. Placement mode (required — decides the per-town cap)

`packages/shared/src/structure-placement-metadata.json` — add an entry:
`showOn` (which build-menu contexts show the button — usually
`["town", "support"]`), `placementMode`, `sortGroup`.

**`placementMode` is the entire per-town cap mechanism**:
- `"same_tile"` — one per tile, unlimited tiles per town (uncapped). Use
  this for anything meant to be built repeatedly (Fort, Camp, Mine, and —
  per an explicit design decision — Weapons Workshop, Mintworks, Ancillary
  Factory).
- `"town_support"` — capped at exactly one per connected-town network,
  enforced in `resolveTownSupportTarget()`
  (`apps/simulation/src/runtime-structure-command-handlers.ts`).

## 6. Combat/economy effect wiring (required if the structure does anything)

This is the one step with no fixed file list — it depends entirely on what
the structure does. Some precedent to reuse rather than reinvent:

- **A per-owned-count multiplier feeding into combat** (what Weapons
  Workshop does): read `ownedStructureCountForPlayer(playerId, "<TYPE>")` —
  already incrementally maintained by
  `apps/simulation/src/runtime-owned-structure-index.ts` for every
  `economicStructure`-tileField type, no extra bookkeeping needed — and feed
  the result into a new field on `FrontierCombatModifiers`
  (`packages/shared/src/frontier-combat/frontier-combat.ts`), computed in
  `resolveAttackCombat` (`apps/simulation/src/runtime-combat-support.ts`).
- **A tech/domain-driven multiplicative stat effect**: read via
  `multiplicativeEffectForPlayer` (`tech-domain-bridge.ts`) — see
  `attackVsFortsMult`/`fortDefenseMult` for the pattern.
- **A radius-based area effect** (like Waterworks/Governor's Office):
  `packages/client/src/client-structure-effects/client-structure-effects.ts`
  plus the matching server-side scan in `apps/simulation/src`.
- **A resource-producing structure**: see the Synthesizer family in
  `apps/simulation/src/player-update-economy/player-update-economy.ts`.

Add a config constant for any new magic number in
`packages/shared/src/config.ts`, not inline.

## 7. Client: 3D overlay (required for visual parity)

`packages/client/src/client-map-3d-structure-*.ts` — pick the family file
that matches the structure's theme (`-economic`, `-industrial`,
`-late-game`, `-civic`, `-infrastructure`, `-manpower`). Add the type to
that file's `Kind` union and `_KINDS` set, declare geometries/materials,
`makeSlot` each piece, write a layout function, and register it in the
family's returned `layouts` map. No changes needed in the dispatcher
(`client-map-3d-structure-overlay.ts`) or the orchestrator
(`client-map-3d/client-map-3d.ts`) — both are generic over
`STRUCTURE_KINDS_HANDLED_BY_3D`.

Reuse an existing family's shared materials (e.g. the "forge palette" in
`client-map-3d-structure-economic.ts`'s `EconomicSharedAssets`) for visual
consistency with structures in the same theme, rather than declaring
one-off materials for everything.

## 8. Client: 2D icon (required)

Add an SVG to `packages/client/public/overlays/<kebab-name>-overlay.svg`.
No registration needed — `packages/storybook/src/2d/Overlays.stories.ts`
auto-discovers every file in that directory via `import.meta.glob`, and
`imageFor()` (step 9) is the only place that needs to reference the path.

## 9. Client: display text, icon lookup, tooltip (required)

All in `packages/client/src/client-map-display.ts`:
- Add the type to `StructureInfoKey` and to `STRUCTURE_BRANCH_BY_KEY`
  (War/Economy/Manpower/Aether — for the branch-tag UI).
- Display name: add a branch in the name-lookup function.
- `economicStructureBenefitText()`: one-line benefit summary (used in a
  couple of secondary UI spots).
- `structureBaseKey()`'s return-type union: add the type here too (only if
  it isn't an upgrade-tier alias of an existing type).
- `effectsFor()`: bullet-point list shown in the detail tooltip.
- `imageFor()`: the SVG path from step 8.
- **The explicit `if (type === "<TYPE>") { return structure({...}) }`
  tooltip block.** This is easy to skip because there's a silent fallback
  at the end of the function — skip this and the structure's tooltip
  silently renders as "Siege Outpost" (a real, still-unfixed bug for
  several older structures; don't add a new instance of it).
- `costBitsFor()`/`upkeepBitsFor()` usually need no per-type entry — they
  derive generically from `structureCostDefinition`/
  `structureSlotRequirements`/`STRUCTURE_SLOT_REQUIREMENTS` unless the
  structure has a non-standard upgrade-tier cost curve (see the
  `IRON_BASTION`/`SIEGE_TOWER` special cases for the pattern).

`packages/client/src/client-types.ts` — add the type to the
`economicStructure.type` field's literal union and to `OptimisticStructureKind`
(both are load-bearing: the former is the real wire-payload shape, the
latter drives optimistic UI). Several OTHER narrower unions in this file
(used for lastStructureType, victory-objective stats, etc.) intentionally
don't need every structure type — check whether an existing recent
addition (e.g. `POPULATION_BUREAU`) is already in a given union before
adding yours; if it isn't, that union doesn't need this one either.

## 10. Client: build button + tile-action wiring (required to build it at all)

`packages/client/src/client-tile-action-logic/client-tile-action-logic.ts` —
add a `buildShowsOnTile("<TYPE>", ...)` block that pushes a `build_<type>`
action with tech/slot-availability gating (`hasFreeResourceSlots`,
`missingResourceSlotReason`) and a cost/detail label. Copy an existing
same-shaped entry (e.g. `LOGISTICS_GUILD`) rather than writing from
scratch — the gating boilerplate is identical for every same-tile,
tech-gated, resource-slot-consuming structure.

`packages/client/src/client-types.ts` — add `"build_<type>"` to the tile
action-id union.

**`packages/client/src/client-tile-action-support/client-tile-action-support.ts`
(required — this is the single most-skipped step in this whole playbook).**
Add `case "build_<type>": return "<TYPE>";` to `structureTypeForTileAction()`,
and, if tech-gated, `case "build_<type>": return "<tech-id>";` to
`requiredTechForTileAction()`. The previous paragraph's `buildShowsOnTile`
block is what makes the button *appear*; clicking it routes through
`structureTypeForTileAction()` to decide what to actually build, and
`client-action-flow.ts` only dispatches a build when that call returns
something truthy. Miss the case here and the button renders correctly, is
clickable, and does **absolutely nothing** — no optimistic update, no
message sent to the server, no error. This exact bug shipped twice for real
structures because this file lives in a different directory than
`client-tile-action-logic.ts` and is easy to forget once the button itself
looks done: Weapons Workshop's two replacements (Titanium/Umbrite Weapons
Factory, #1253), then Quartermaster's Office/Assembly Works/Logistics Guild
found alongside them (#1265). `unmappedBuildActionWarning()` in this same
file now catches a *future* instance of this at runtime (logs and shows the
player an error instead of dead silence) — that's a safety net for when this
step gets missed again, not a substitute for doing it.

Optional: `packages/client/src/client-tech-detail-ui/client-tech-detail-ui.ts`'s
`relatedStructureTypesForTech()` — add a case so the tech's detail card
shows a "Structures:" link to the new building. Easy to forget since it
doesn't cause a build error, just a silently missing UI affordance.

## 11. Wire protocol: message schema enum (required — or the server rejects the build with `BAD_MSG`)

`packages/shared/src/messages/messages.ts` — add `"<TYPE>"` to the
`structureType` enum inside `ClientMessageSchema`'s `BUILD_ECONOMIC_STRUCTURE`
entry. This is a **separate list from every union in steps 1/9/10** — Zod
validates the incoming wire message against this exact enum before the
command ever reaches `runtime-structure-command-handlers.ts`, so a type
missing here fails validation even when every other step was done
correctly. The failure mode is a real, player-visible `BAD_MSG` /
`invalid_enum_value` error — an improvement over step 10's silent no-op, but
the build is still broken.

This is exactly what happened for the two Weapons Factories in #1275: this
gap existed the whole time, but step 10's dispatch bug was masking it — the
build attempt only started reaching the server (and failing here) once #1265
fixed the client-side click path. Don't take "no reports of this failing"
as evidence this step is unnecessary; it may just mean step 10 is still
broken too.

Add a regression test to `packages/shared/src/messages/messages.test.ts`
asserting `ClientMessageSchema.parse({ type: "BUILD_ECONOMIC_STRUCTURE", x, y,
structureType: "<TYPE>" })` succeeds — see the Weapons Factory test added in
#1275 for the pattern.

## 12. If gating behind a NEW tech (only if step 4 needed one)

`packages/game-domain/data/tech-tree.json` — add an entry: `id`, `tier`,
`branch`, `name`, `description`, `requires` (single prereq) or `prereqIds`
(array — supports multiple prerequisites converging on one tech, e.g.
requiring two different branch-root techs), `cost`, `researchTimeSeconds`,
`effects: { "unlock<PascalCaseType>": true }`.

Client-side, add the matching label in two places:
- `packages/client/src/client-tech-html/client-tech-html.ts`'s
  `effectSummaryLabel()` — `if (key === "unlock<Type>" && value === true) return "Unlocks <Name>";`
- `packages/client/src/client-tech-payoffs.ts`'s highlight-label map —
  required, there's a test (`client-tech-payoffs.test.ts`) that asserts
  every `unlockX` key in the tech catalog has a highlight label.

## 13. Storybook demo

`packages/storybook/src/3d/StructureOverlay.stories.ts` — add the type to
the `KINDS` array (for the `AllKinds`/gallery view) and a single-instance
`export const <Name>: Story = { args: { structures: ["<TYPE>"], cameraDistance: <N> } };`.
The 2D icon needs no story of its own (auto-discovered, see step 8).

## 14. Changelog entry (required to push — pre-push hook enforced)

Any push touching `packages/client/src/` is blocked unless
`packages/client/src/client-changelog/client-changelog-data.ts` gets a new
entry (`createdAt`, `introducedIn`, `title`, `why`, `changes`).

## 15. Tests to update or add

- `packages/shared/src/structure-registry/structure-registry.test.ts` —
  bump `STRUCTURE_REGISTRY_SIZE`'s expected count, and add the type to
  either the upkeep-parity map or `noUpkeepTypes`.
- Add a focused unit test for any new mechanic (see
  `frontier-combat.test.ts`'s Weapons Workshop mult tests for the pattern).
- Add one end-to-end integration test using a real `SimulationRuntime` if
  the effect is combat/economy-facing — cheap insurance against the wiring
  silently disconnecting somewhere in the chain.
- If you changed an EXISTING structure's `placementMode` (e.g. removing a
  per-town cap), grep for that structure's name across
  `apps/simulation/src/runtime/runtime.test.ts`,
  `runtime-rush-buy.test.ts`, `build-structure-parity.test.ts`, and
  `client-tile-action-support.test.ts` — any test asserting the old
  town-support redirect behavior needs updating, not just the new
  structure's own tests.

## Verification checklist

1. `npx tsc --noEmit -p .` clean in `packages/shared`, `apps/simulation`,
   `packages/client`, `packages/storybook`.
2. Full `vitest run` clean in `packages/shared`, `packages/game-domain`,
   `apps/simulation`, `packages/client`.
3. Visually confirm both the 3D overlay and 2D icon render in Storybook
   before shipping — a typecheck pass does not catch a structure that
   silently falls through to the wrong tooltip, an invisible/occluded 3D
   mesh, or a broken SVG path.
4. Grep the new type's exact `SCREAMING_SNAKE_CASE` name across the whole
   repo and skim every hit. TypeScript and tests won't catch a switch/enum
   that's simply missing a case for a valid string literal — that failure
   mode is silent (step 10) or a runtime-only error (step 11), not a
   compile error. This single grep is what would have caught both #1265 and
   #1275 before they shipped.
5. Actually click the build button end-to-end against a running server —
   don't stop at "the button appears and isn't grayed out." Both bugs this
   playbook was amended for left the button fully looking correct; only
   clicking it surfaced "nothing happens" (step 10) or `BAD_MSG` (step 11).
