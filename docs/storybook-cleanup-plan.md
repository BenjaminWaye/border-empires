# Storybook cleanup plan

Status: proposed (2026-10-23). Nothing here has shipped yet.

`packages/storybook` grew one story file per feature PR, with no
taxonomy and no review of what stays. Today it has **150 `*.stories.ts`
files (~20k lines)**, sorted by renderer ("2D Library", "3D Library") rather
than by what the player sees, with prototype copies of shipped code and
models the game never renders. This plan cleans it up in five small PRs.
The package is a leaf (nothing imports it), so the PRs carry little
regression risk and cause few merge conflicts. The exception is PR 5, which
changes what players see.

## What is wrong today (audit, 2026-10-23)

### 1. Stories that duplicate shipped code instead of rendering it

| Stories | Problem | Size |
|---|---|---|
| `src/wonders/*.stories.ts` (9) | Each one rebuilds its natural wonder inline from raw `three` primitives. None of them imports `packages/client/src/client-map-3d-natural-wonders/*-overlay.ts`, the code the game actually renders. They show what the wonders looked like at prototype time, not what ships. | 2,817 lines |
| `src/2d/{BarleyField,TitaniumDeposit,RelayBeaconIcon,TradeNexusIcon}.stories.ts` | Each one is a copy of `2d/Overlays.stories.ts` (an `import.meta.glob` SVG gallery) narrowed to one filename pattern. | 516 lines |
| `src/2d/WatchtowerMinimapMarker.stories.ts` | Copies the pixel math from `client-minimap.ts` ("mirrors the exact pixel math"). `2d/WatchtowerMinimap.stories.ts` already renders the real minimap. | |
| `src/PersistentAlertLocators.stories.ts` | Reimplements the alert glyph drawing with no client import. `ShardRainArrowLocator.stories.ts` already renders the real `client-persistent-alerts`. | |

### 2. Models and stories the game never uses

- **8 AFC module models exist only in Storybook and tests.** They are not
  in `MODULE_FAMILY_FACTORIES` (`client-map-3d-afc-module-family.ts`), so
  in game each one docks as a generic cartridge. Each maps to a real tech in
  `packages/game-domain/data/tech-tree.json`, so these models are unwired
  rather than dead:

  | Model file (`packages/client/src/`) | Tech id |
  |---|---|
  | `client-map-3d-bastion-master-die-module.ts` | `fortified-walls` |
  | `client-map-3d-hive-mind-module.ts` | `muster-discipline` |
  | `client-map-3d-hive-mind-ii-module.ts` | `muster-command` |
  | `client-map-3d-thunderplate-induction-module.ts` | `steelworking` |
  | `client-map-3d-neural-assembly-core-module.ts` | `global-trade-networks` |
  | `client-map-3d-reserve-lattice-module.ts` | `conveyor-networks` |
  | `client-map-3d-ancillary-control-core-module.ts` | `remade-concordat` |
  | `client-map-3d-catalyst-fabricator-module.ts` | `advanced-synthetication` |

  (`cryptography`, the Counterphase Core Module, has no model at all.)
- **`client-map-3d-town/client-map-3d-town.ts`** (153 lines plus its
  regression test) is used only by `3d/TownAlternativeLarger.stories.ts`, a
  town design the game never adopted. The shipped town is
  `client-map-3d-town-overlay.ts`.
- **GLB files in `packages/client/public/models` with zero references:**
  `voidcrystal-colossus.glb` and `fishing1.glb`. The game loads
  `fishing2.glb`.
- **11 SVGs in `packages/client/public/overlays` that client code never
  references.** The `Overlays` glob gallery is the only place they appear:
  `aether-survey-line-overlay.svg`, `ancient-town-overlay-{grass,sand}.svg`,
  `fort-ring-overlay-open-{north,east,south,west}.svg`, and
  `palisade-ring-overlay-open-{north,east,south,west}.svg`. The game uses
  only the `*-closed.svg` ring variants.

### 3. Near-duplicate stories (same subject, split across files)

- Roads: `RoadOverlay`, `RoadOverlayV2` (titled "RoadOverlay (patterns)"),
  `RoadOverlayWithHills`.
- Ownership: `OwnershipOverlay`, `OwnershipOverlayOnTerrain`,
  `HillsOwnershipOverlay`, `FoggedSeaOverlay (bug regression)`.
- Vegetation and mountains: `Forest`, `TreeModels`, `ForestVsMountains`,
  `MountainMassif`, `MountainModels`, plus `2d/Forest2D` and
  `2d/MountainPeaks2D` in a separate tree.
- Town: `Town`, `TownAlternativeLarger`, `TownOnTerrain`, `TownSupportRing`,
  `TownSupportTile`.
- AFC: `FabricationComplex` plus **24 more files** that import from it
  (3,485 lines in total). Most are a single module on the same stage.
- Popup marines: `PopupMarineOverlayFx`, `PopupMarineSkirmish`,
  `PopupMarineTitanAnimationPreview`, `BattleStrikeFx`.

### 4. No structure

- Stories are grouped by renderer, not by feature. A watchtower lives in
  `2D Library/WatchtowerTile2D`, `2D Library/WatchtowerMinimap`,
  `2D Library/WatchtowerMinimapMarker` and `3D Library/WatchtowerOverlay`,
  four sidebar entries in two trees. This works against the renderer-parity
  rule in `AGENTS.md`: you can't see at a glance whether a feature has both
  renderers.
- Sidebar roots are inconsistent: `2D`, `2D Library`, `3D Library`, `UI`,
  `UI/HUD`, `HUD`, `Aether Abilities`, `Monument Abilities`,
  `Natural Wonders` and `Tile Menu`, plus loose files at the `src/` root.
  Folder paths don't match titles: `src/aether/` holds
  `Monument Abilities/*`, and `src/` root holds `HUD/*` and `UI/*`.
- **Story files import from other story files.** 24 stories import
  `startUpdateLoop`, `glintStage`, `studioStage` and `createContactShadow`
  from `3d/FabricationComplex.stories.ts`. `createContactShadow` also
  duplicates the client's own `client-map-3d-contact-shadow`.
- Shared fixtures are scattered: `three-stage.ts`,
  `3d/construction-story-afc.ts`, `frontier-supply/`, `incursion-breach/`,
  `hud/hud-stat-chips-fixture.ts`, `tile-menu/real-building-menu-view.ts`.
- Mixed import styles: most stories use `@client/...`, but 4 files reach
  into `../../../client/src/...` directly.
- No guardrail. `build` is a no-op echo, `test` has no tests, and only
  `tsc` runs in CI. Nothing stops the next prototype from being parked
  here permanently.

## Target structure

The sidebar is organised by **what the player sees**. Each feature's 2D and
3D views sit next to each other, and folders mirror titles one to one.

```
packages/storybook/src/
  fixtures/            # stage, lighting, update loop, demo worlds; no stories
    three-stage.ts       (+ glintStage/studioStage/startUpdateLoop moved here)
    afc.ts               (was 3d/construction-story-afc.ts)
    frontier-supply-world.ts, incursion-breach-world.ts, hud-stat-chips.ts, ...
  map/
    terrain/           # Heightfield, Water, Rivers, Hills, Tundra, Atmosphere
    vegetation/        # Forest (3D trees + 2D overlay), Mountains (3D + 2D peaks)
    resources/         # Titanium, Umbrite, Farmland, Fishing, Prospect clues
    structures/        # Town, Fort, Watchtower, Waystation, Relay Beacon,
                       # Trade Nexus, Siege Tower, Census Hall, Manufactory,
                       # Ancillary Depot, Umbrite rig/factory, Ambaric,
                       # Construction (site, pod flight, fort/relay builds)
    afc/               # Fabrication Complex + ONE module gallery story
    wonders/           # ONE gallery over the real natural-wonder overlays
    overlays/          # Ownership, Reach, Frontier supply, Defensibility,
                       # Roads, Docks, Settle, Shard, Incursion, Planetary defense
    badges/            # Unfed, Upgrade ready, Shard rain, Observatory cooldown,
                       # Queue corner badges, Floating text, Waypoint flag
    combat/            # Attack, Muster (banner, transit, march, arrow drag),
                       # Popup marines (FX, skirmish, strike, Titan rig)
    abilities/         # Aether (bridge, wall, purge, bombard, siphon, sweep,
                       # reveal, retort) and Monument (pulse, aegis lock)
  ui/
    hud/               # Stat chips, Manpower gauge, Alert locators, Minimap
    tile-menu/         # Tile overview, AFC module overview, Dev queue states
    panels/            # Muster commit sheet, Town capture, Occupation survey,
                       # Waystation activation, Discovery tips, Empire dossier
    space-view/        # Duke buttons, Welcome letter, Fleet hulls
  assets/
    svg-overlays.stories.ts   # the one SVG gallery, with preset filter stories
  sandbox/             # proposals only, e.g. Grouped Building Menu
```

Title rule: `title` equals the folder path in Title Case, e.g.
`map/structures/watchtower.stories.ts` → `Map/Structures/Watchtower`, with
named stories `3D`, `2D`, `Minimap`. A feature with only one renderer shows
that in its story names, which makes parity gaps visible.

## Execution: five PRs

Each PR is independently mergeable off `develop` and runs `pnpm ci:local`.
PRs 1 to 4 change nothing in the game, so they need no changelog entry
("Lore reviewed; no canon change").

### PR 1: delete dead stories and assets (no game change)

- Delete `3d/TownAlternativeLarger.stories.ts`, `client-map-3d-town/`
  (module and test), `2d/WatchtowerMinimapMarker.stories.ts` and
  `PersistentAlertLocators.stories.ts`. First confirm that
  `ShardRainArrowLocator` covers every state the deleted alert story showed,
  and port any it misses.
- Delete `public/models/voidcrystal-colossus.glb` and `fishing1.glb`.
- Delete the 11 unreferenced SVGs. Before deleting, re-run the reference
  check with a dynamic-name grep (template literals such as
  `` `${kind}-ring-overlay-open-${dir}` ``) to make sure none are built at
  runtime.
- Re-run the audit commands below to make sure nothing new has appeared.

### PR 2: restructure (moves and renames only)

- `git mv` every file into the target tree and rename titles to match.
  Moves keep `git log --follow` history.
- Move the stage helpers out of `FabricationComplex.stories.ts` into
  `fixtures/three-stage.ts`. Replace the story-local `createContactShadow`
  with the client's `client-map-3d-contact-shadow`. After this PR, no story
  imports another story.
- Normalise the 4 relative `../../../client/src/...` imports to `@client/...`.
- Update `docs/adding-a-structure-playbook.md` §8 and §13, which name
  `2d/Overlays.stories.ts` and `3d/StructureOverlay.stories.ts`.

### PR 3: consolidate duplicates

- **AFC:** combine the 24 single-module files into
  `map/afc/modules.stories.ts`. Drive it from the registry
  (`AFC_MODULE_FAMILY_TECH_IDS` plus a select arg), so a new module family
  appears without a new story file. Keep `FabricationComplex` hero, bays
  and on-grass stories, and the delivery and drop FX stories.
- **Wonders:** replace the 9 inline prototypes (2,817 lines) with one
  gallery that renders the real `createNaturalWonderOverlays` output, with
  one named story per wonder. Before deleting the prototypes, compare
  screenshots. If a prototype has detail the shipped overlay lacks, raise
  it as a separate client issue rather than keeping the prototype.
- **SVG icons:** delete the 4 single-pattern copies. Add preset stories
  (`Farm`, `Titanium`, `Relay beacon`, `Trade nexus`) to
  `assets/svg-overlays.stories.ts` as `filter` args.
- **Roads, Ownership, Vegetation and mountains, Town, Popup marines:**
  merge each group into one file with named stories. Keep
  `FoggedSeaOverlay` as a named regression story inside Ownership.

Expected result: roughly 150 files down to about 70, and about 20k lines
down to about 13k.

### PR 4: guardrails, so it stays clean

- Add `packages/storybook/src/storybook-structure.test.ts` (it runs in the
  existing `pnpm -r test`), which fails when:
  - a story's `title` doesn't match its folder path, or its root isn't one
    of `Map`, `UI`, `Assets` or `Sandbox`;
  - any file imports from a `*.stories.ts` file;
  - a story under `map/` or `ui/` doesn't import from `@client/` (stories
    there must render shipped code; prototypes go in `sandbox/`);
  - a `sandbox/` story lacks an `owner` and `added` date in
    `parameters.sandbox`, or is more than 30 days old, so proposals have
    to be promoted or deleted.
- Add `packages/storybook/README.md` with the taxonomy, the "render real
  code" rule and how to run Storybook. Link it from `docs/README.md`.
- Optional: an "unused public asset" check, a small script that fails
  when a file under `packages/client/public/{models,overlays,textures}` has
  no reference in `packages/client/src`.

### PR 5: wire the 8 orphan AFC module models (changes what players see)

This is a game change, not cleanup, and it needs your decision. If you
want the models shown in game:

- Add the 8 tech-id → factory entries to `MODULE_FAMILY_FACTORIES`.
- Check the 2D renderer's AFC glyph, per the renderer-parity rule.
- Add a changelog entry and run a lore check against the AFC section of
  `docs/lore/galactic-lore.md`.
- Update `docs/manifest-afc-overlay-wiring-plan.md` and
  `docs/manifest-full-plan.md` (12 → 20 families covered, with
  Counterphase Core still missing).

If you don't want them, delete the 8 modules, their regression tests and
their stories in PR 1 instead.

## Open decisions

1. **The 8 AFC module models:** wire them in (PR 5) or delete them?
   Recommendation: wire them in. They match real techs and already have
   regression tests.
2. **The `TownAlternativeLarger` design:** confirm it was rejected before
   deleting it.
3. **The wonder prototypes:** confirm the shipped overlays replace them,
   after the screenshot comparison in PR 3.
4. **Is the guardrail strictness right?** In particular, the 30-day
   sandbox expiry and the "Map/UI stories must import `@client`" rule.

## Audit commands (re-run before PR 1)

```bash
# Client modules reachable only from storybook/tests
cd packages/storybook && grep -rhoE '"@client/[^"]+"' src | sort -u | tr -d '"' \
  | sed 's|@client/||; s|\.js$||' > /tmp/mods.txt
cd ../client/src && while read m; do b=$(basename "$m")
  n=$(grep -rlE "[\"/]$b(\.js)?\"" --include=*.ts . | grep -v '\.test\.ts$' | grep -v "^\./$m\.ts$" | wc -l)
  [ "$n" -eq 0 ] && echo "storybook-only: $m"; done < /tmp/mods.txt

# Public assets with no reference in client code
cd packages/client && for f in public/models/* public/overlays/* public/textures/*; do
  b=$(basename "$f"); grep -rqF "${b%.*}" src || echo "unreferenced: $f"; done

# Stories that render no shipped code
cd packages/storybook && grep -rL '@client/\|client/src' src --include=*.stories.ts
```
