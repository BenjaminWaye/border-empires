# Battle Units (weapons-factory specialists)

## Scope

The 3D battle overlay's squads and march companies: how a weapons factory's
specialists (titanium war-walkers, Umbrite heavy troopers) are composed into
squads, how they behave, and how to add a new factory's unit end to end
(Meshy model -> bake -> registry). Not covered: combat math (server-side,
`docs/game-mechanics.md`) or the 2D renderer, which draws no battle soldiers.

## Entry Points

- `packages/client/src/client-map-3d-popup-marine/popup-marine-gear.ts`: factory table (kind, wire flag, structure type).
- `packages/client/src/client-map-3d-popup-marine/popup-marine-units.ts`: unit profiles (model, scale, role, lineup lead), `FACTORY_SPECIALISTS`, the specialist budget, `squadUnitsFor`.
- `packages/client/src/client-map-3d-popup-marine/popup-marine-roles.ts`: per-role path/stance over the shared timeline (`charge`, `support`, `braced`, `line`).
- `packages/client/src/client-map-3d-popup-marine/popup-marine-asset.ts` / `popup-marine-slot.ts` / `popup-marine-pools.ts`: model URLs, muzzle-flash bone and finish per model, per-model slot pools.
- `packages/client/src/client-map-3d-popup-marine/popup-marine-metal-material.ts`: bare-metal + glow shader from the baked `_MASK`.
- `packages/client/src/client-map-3d-muster-transit-overlay.ts` + `client-map-3d-muster-transit-sync.ts`: march companies (same composition, big units at head/tail).
- `apps/simulation/src/runtime-weapons-factory-mults.ts`: `battleWarGearFor` (server side of the factory table).
- `packages/client/scripts/bake_marine_surface.py`: shared bake steps (voxel mesh rebuild, texture-sampled surface classes); `bake-popup-marine-titanium-model.py` (unit with its own Meshy clips), `bake-popup-marine-umbrite-model.py` (humanoid; standard marine clips retargeted).
- Storybook: `PopupMarineSkirmish` (per-side factory toggles), `MusterTransitOverlay/MixedCompany`, `PopupMarine*Preview` clip previews.

## Adding a weapons factory's unit

1. Server: add a `BattleWarGear` flag (`packages/sim-protocol/src/simulation-event.ts`) and a row in `WAR_GEAR_FLAG_BY_FACTORY`.
2. Client table: add the kind to `WEAPONS_FACTORY_KINDS`, `WIRE_FLAG_BY_FACTORY`, `STRUCTURE_BY_FACTORY`; its units to `UNIT_PROFILES` and `FACTORY_SPECIALISTS`; a `MarineModelKey` + URL + muzzle bone + finish.
3. Model: Meshy concept in A-pose (weapons fused to the body -- A-pose generation drops held items), image-to-3d textured, decimate locally to ~150k, auto-rig (24-bone biped). Humanoids reuse the standard clips (copy the Umbrite bake); non-humanoids need their own Meshy clips (copy the titanium bake).
4. Bake with a classifier for its texture (measure the palette first: value/saturation/hue clusters), then check every clip in Blender renders and in Storybook.
5. Changelog entry + world bible (§11 war industry passage).

## Common Commands

```bash
# bpy wheel (Python 3.11) stands in for Blender:
python -I packages/client/scripts/bake-popup-marine-umbrite-model.py -- <rigged.glb> packages/client/public/models/popup-marine-titan-24bone.glb <out.glb>
pnpm --filter @border-empires/client exec vitest run src/client-map-3d-popup-marine
```

## Invariants

- One timeline for every unit mix and outcome: a unit's behaviour lives in its role, never in a per-combination sequence.
- Specialists stay a minority: at most `MAX_SPECIALISTS_PER_SQUAD` (4 of 7), 2 per factory with up to two factories, 1 each beyond.
- Composition is a pure function of (gear, tile seed, side) so skirmish -> battle -> garrison never reshuffle; a defending garrison keeps its side-0 slots.
- Masked models need the building environment map, or bare metal renders near-black.

## Known Pitfalls

- Meshy meshes are millions of triangles in loose shells: plain decimation shatters them; use `rebuild_game_mesh`.
- Hold the armature in REST during the rebuild (the helper does): a posed source hands every vertex the wrong bones.
- Meshy's biped rig skins body-mounted gear (shoulder cannon, backpack, drum hull) to arms/shoulders; make it rigid on a spine bone with a blended band, or it stretches when arms move.
- Meshy panels that render white can be stored as neutral grey: classify by saturation, not brightness.
- Test mocks of `popup-marine-asset.js` must export every constant the slot reads (`MARINE_MELEE_CLIP`, `MARINE_WALK_CLIP`).
