# Storybook cleanup

Status: done (2026-10-23), except one open decision: whether to show the 8
unwired AFC module models in game. The day-to-day rules now live in
[`packages/storybook/README.md`](../packages/storybook/README.md); this file
records what was wrong and what changed.

## What was wrong (audit, 2026-10-23)

`packages/storybook` had grown one story file per feature PR, with no
taxonomy and no review of what stays: 150 `*.stories.ts` files (about 20k
lines), sorted by renderer ("2D Library", "3D Library") instead of by what the
player sees.

- **`storybook build` failed outright.** `GroupedBuildingMenu.stories.ts`
  hand-copied `main.ts`'s CSS imports, and three of those files had since been
  renamed.
- **Prototype copies instead of shipped code:**
  - The 9 natural-wonder stories (2,817 lines) rebuilt each wonder from raw
    `three` primitives rather than rendering
    `client-map-3d-natural-wonders/`.
  - 4 "icon" stories were the SVG gallery narrowed to one file name.
  - `WatchtowerMinimapMarker` and `PersistentAlertLocators` redrew client
    canvas code by hand.
- **Unused assets:**
  - `voidcrystal-colossus.glb` (and its converter script) and `fishing1.glb`
    had no loader.
  - 3 overlay SVGs (`ancient-town-overlay-{grass,sand}.svg`,
    `aether-survey-line-overlay.svg`) were referenced nowhere.
- **Duplication:** 21 AFC module stories were one template, each with a
  different model. 24 stories imported helpers from
  `FabricationComplex.stories.ts`. The tsconfig carried 40 stale per-file
  `@client` path aliases that Vite never had.
- **Nothing kept it in order:** CI ran only `tsc`, and `test` had no tests.

## What changed

1. **Deleted** the dead stories, the 2 unused GLBs and the converter script,
   and the 3 unused SVGs. (The open fort and palisade ring SVGs look unused to
   a plain text search, but `createDirectionalOverlaySet` in
   `client-map-overlay-images.ts` builds their names at runtime. Check for
   dynamic name builders like that before deleting any asset.)
2. **Fixed the build** by moving `main.ts`'s global CSS imports into
   `packages/client/src/client-styles.ts`. `main.ts` and Storybook both import
   it, so the list can't drift again.
3. **Restructured** every file with `git mv` into
   `map/ ui/ assets/ history/ sandbox/ fixtures/`. Titles now match folders,
   and each feature's 2D and 3D renderers sit side by side. Shared stage,
   lighting and label helpers live in `fixtures/`.
4. **Consolidated:**
   - **AFC modules:** `map/afc/afc-modules.ts` lists every module model with
     its tech. `Map/AFC/Modules` (one story file with a module picker and an
     "All modules" grid) replaces the 21 per-module files.
     `FabricationComplex` docks its modules from the same list.
   - **Natural wonders:** one gallery renders the real
     `createNaturalWonderOverlays`, replacing the 9 prototypes.
   - **SVG icons:** the single-icon stories became preset stories of
     `Assets/SVG Overlays`. Its filter now accepts `a|b`.
5. **Town history** (requested): `History/Town Progression` shows every 3D
   town design the game has shipped, from the first April 2026 houses to the
   current marble plinth. There are 11 frozen code snapshots taken from git,
   plus the live overlay. The first town (`client-map-3d-town.ts`, previously
   the story "TownAlternativeLarger") moved there out of the client. The
   October 2026 textured-model era serves its original GLBs from
   `packages/storybook/public/history/`.
6. **Guardrails:** `src/guardrails/story-structure.test.ts` checks:
   - title roots, and that titles match folders;
   - no imports from story files;
   - every import, CSS included, resolves to a file;
   - `map/` and `ui/` stories render client code;
   - sandbox stories have an owner and are at most 30 days old.

## Decisions

- **Town designs:** keep every past design as a history of the game's
  development rather than deleting the old ones (decided 2026-10-23).
- **Wonder prototypes:** replace them with the shipped overlays (decided
  2026-10-23).
- **Guardrails:** accepted as proposed, including the 30-day sandbox limit
  (decided 2026-10-23). `Sandbox/Grouped Building Menu` was given
  `added: 2026-10-23`.
- **Open: the 8 unwired AFC module models.** Bastion Master-Die, Hive Mind I
  and II, Thunderplate Induction, Neural Assembly Core, Reserve Lattice,
  Ancillary Control Core and Catalyst Fabricator are built and tested, and each
  matches an `AFC_MODULE` tech in `tech-tree.json`. None is in
  `MODULE_FAMILY_FACTORIES` (`client-map-3d-afc-module-family.ts`), so in game
  those techs dock the generic cartridge. `Map/AFC/Modules` labels them
  "not in game".
  - Wiring them in is a change players will see, so it needs a changelog entry
    and a lore check, and the 2D AFC glyph must be checked (renderer parity).
  - `cryptography` (the Counterphase Core Module) has no model at all.
