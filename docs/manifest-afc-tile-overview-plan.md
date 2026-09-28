# AFC tile overview UI — implementation plan

Status: planned (2026-09-28), not yet executed

Source: `docs/manifest-full-plan.md`'s "New: AFC tile overview UI" backlog
item (added 2026-09-28 per user request). Presentation-only, no new server
state — reads the AFC/module data that already exists
(`Tile["afc"] = { ownerId, status, activatedAt?, modules?: string[] }`,
`apps/simulation/src/afc-module-commissioning.ts`). Independent of the
10-module-overlay work landing on a separate branch; a module renders here
by tech id the moment it's commissioned, whether or not it has 3D/2D map
art yet.

## Current state (read from code, 2026-09-28)

- Tapping an AFC tile shows only the generic title "Automated Fabrication
  Complex" (`client-tile-menu-view/client-tile-menu-title.ts:23`) and
  whatever `tileOverviewModifiersForTile`/`tileFeatureLeadLines`
  (`client-tile-overview-modifiers/client-tile-overview-modifiers.ts`)
  produce for it today — neither function special-cases `tile.afc` at all,
  so no docked-module list is shown anywhere.
- `tile.afc.modules` is an unbounded, order-preserving array of docked
  AFC-Module tech ids (`afc-module-commissioning.ts` — no server-side cap;
  only the 3D renderer's 8-socket asset caps what's *shown on the map*, per
  `docs/manifest-afc-overlay-wiring-plan.md`). This panel has no such
  visual-socket constraint and should list every docked module, not just
  the first 8.
- Each AFC-Module tech's **category** (Economy / Manpower / War / Aether,
  §4/§6 of `docs/manifest-full-plan.md`: "Economy, Manpower, and War
  modules are distinct AFC attachments") is already encoded per-tech as
  `branch` on `TechInfo` (`packages/client/src/client-tech-info-types.ts`)
  and as `"branch"` in `packages/game-domain/data/tech-tree.json` — spot
  checked all 22 `manifestCategory: "AFC_MODULE"` techs and every one's
  `branch` (`war`/`economy`/`manpower`/`aether`) matches §6's own table
  exactly (e.g. `masonry` → `war` → "Titanium Forge Module | War";
  `workshops` → `economy` → "Umbrite Synthesis Module | Economy"). **No new
  mapping table needed** — group by `techCatalog` lookup's `.branch`, keyed
  off `manifestCategory === "AFC_MODULE"` (or just: any tech id present in
  `tile.afc.modules`, since nothing else is ever legally in that array).
- `state.techCatalog: TechInfo[]` (`client-state/client-state.ts:181`)
  already holds the full tech list including `id`/`name`/`branch` for every
  tech the client knows about — no new state or server field needed, just
  a lookup.
- `Tile["afc"].status` is `"active" | "inactive"` for the **whole AFC**,
  not per-module (`client-types.ts:271` / `shared/src/types.ts:282`) — §4's
  "if an AFC is captured, its modules become dormant or inaccessible to the
  original owner; they remain visible" maps directly to
  `status === "inactive"`: still list every docked module, but flag the
  whole group as dormant rather than trying to grey out individual rows.
- **Reference pattern to copy**: `client-town-stat-grid/client-town-stat-grid.ts`
  (89 lines) — a pure, unit-tested `townStatGridHtml(input): string`
  function with an `XInput` type of precomputed fields (no logic/lookups
  inside the HTML builder itself), rendered by the caller via
  `lines.push({ kind: "statgrid", html: townStatGridHtml({...}) })` in
  `client-tile-menu-view.ts:195-213`. `TileOverviewLine.kind` already has a
  `"statgrid"` variant (`client-tile-menu-types.ts:66`) built for exactly
  this. Styling lives in its own co-located stylesheet
  (`client-town-stat-grid-style.css`), imported once in `main.ts:17`
  alongside ~30 other per-component stylesheets — same pattern to follow.
- **File-line headroom is tight**: `client-tile-menu-view.ts` is 494/500
  lines today (`menuOverviewForTile` lives here). The hook-in must be a
  handful of lines at most — all real logic (grouping, dormancy text,
  per-branch ordering) belongs in the new file, mirroring how
  `townStatGridHtml` keeps `menuOverviewForTile`'s own diff to one
  `lines.push({...})` call.

## Implementation steps

### 1. New pure HTML-builder component
`packages/client/src/client-afc-module-grid/client-afc-module-grid.ts`
(new directory, matching `client-town-stat-grid/`'s convention):
- `export type AfcModuleGridInput = { status: "active" | "inactive"; modules: Array<{ techId: string; name: string; branch?: string }> }`
  — caller (the tile-menu view) resolves each `techId` in
  `tile.afc.modules` to its `TechInfo` via `techCatalog` *before* calling
  in, so this file stays a pure formatter with no catalog dependency,
  exactly like `townStatGridHtml` takes precomputed numbers, not raw tile
  state.
- `export const afcModuleGridHtml = (input: AfcModuleGridInput): string`:
  - Groups `input.modules` by `branch` into the 4 fixed families in a
    stable order: Economy, Manpower, War, Aether (any module with an
    unexpected/missing `branch` — shouldn't happen given the AFC_MODULE
    category check above, but don't throw — falls into a 5th "Other"
    bucket rendered last rather than being silently dropped).
  - Renders a heading per non-empty family (`<div class="afc-module-family">Economy</div>` style, echoing `pushModifierGroup`'s heading pattern in
    `client-tile-menu-view.ts`) followed by one row per module showing its
    display name (`TechInfo.name`, e.g. "Umbrite Synthesis Module" — not
    the raw tech id).
  - Whole-panel dormant state (`input.status === "inactive"`): a single
    banner line above the groups, e.g. "Dormant — modules inactive until
    this AFC is reclaimed" (wording to match §4's "become dormant or
    inaccessible to the original owner" — the viewer here is always the
    tile's current owner or a spectator, per how `menuOverviewForTile` is
    only ever called for tiles the requesting player can see the full
    overview of, so no separate "not your AFC" branch is needed — confirm
    this assumption against `menuOverviewForTile`'s existing owner-gating,
    if any, at execution time).
  - Empty `input.modules` (no modules commissioned yet): a plain
    "No modules commissioned yet" line, not an empty grid — matches the
    town grid's own precedent of always rendering something legible rather
    than collapsing to nothing.
  - Escape all interpolated text (reuse the `escapeHtml` pattern from
    `client-town-stat-grid.ts`, or extract it to a shared tiny util if a
    third caller would want it — check for an existing shared escape
    helper first, don't duplicate a third copy if one's already shared).
- Unit test `client-afc-module-grid.test.ts` alongside it (matches
  `client-town-stat-grid.test.ts`'s shape): asserts on structural presence
  (family headings appear, module names appear under the right heading,
  dormant banner shows only when inactive, empty-state text shows only
  when `modules` is empty) rather than pixel/CSS output — this is a pure
  string builder, straightforward to test exhaustively unlike the
  `drawX2D` canvas-draw functions.

### 2. Stylesheet
New `packages/client/src/client-afc-module-grid-style.css` (flat file at
`src/` root, matching `client-town-stat-grid-style.css`'s actual location
— the component's own `.ts` lives in a subdirectory but its stylesheet
doesn't, per that existing precedent). Reuse `client-town-stat-grid-style.css`'s
tokens/spacing where the shapes match (mini-stat rows, group headings) —
don't invent a parallel design language. Add one import line to
`packages/client/src/main.ts` alongside the existing `client-town-stat-grid-style.css`
import.

### 3. Wire into the tile menu
In `client-tile-overview-modifiers/client-tile-overview-modifiers.ts` (NOT
`client-tile-menu-view.ts` directly — keeps that file's diff to the
unavoidable minimum given its 494/500 headroom): add a small
`afcModuleGridLineForTile(tile: Tile, techCatalog: TechInfo[]): TileOverviewLine | undefined`
helper here (or in the new component file itself, whichever keeps
`client-tile-overview-modifiers.ts` — currently 321/500, more headroom —
from needing its own extraction; decide at execution time by re-checking
both files' current line counts) that:
- Returns `undefined` when `!tile.afc`.
- Resolves `tile.afc.modules ?? []` against `techCatalog` (by `id`),
  building `AfcModuleGridInput["modules"]`; a docked tech id with no
  catalog match (shouldn't happen, but the array's shape doesn't
  statically guarantee it) is skipped, not thrown on — matches
  `createAfcOverlayGroup`'s own "unknown tech id docks nothing" precedent
  from the 3D wiring work.
- Returns `{ kind: "statgrid", html: afcModuleGridHtml({ status: tile.afc.status, modules }) }`.

Then in `client-tile-menu-view.ts`'s `menuOverviewForTile`, widen the
`state` dep's type to also pick `techCatalog: TechInfo[]` (it's already the
real `ClientState` object at the call site — `state.techCatalog` already
exists there today, per `client-state.ts:181` — this is a type-only
widening, not new plumbing) and add one line near where `tileFeatureLeadLines`
is called (both are "land tile feature lead" content, §"tileFeatureLeadLines"'s
own doc comment already frames this as "the special thing on it... goes
first"): push the AFC module grid line there, or immediately after,
whichever reads better once the actual HTML is in front of you — a single
`if (tile.afc) lines.push(...)`-shaped addition, ~2-3 lines. Re-verify
`wc -l` after this edit; if it pushes the file to 495-500 that's still
within the cap, but confirm before committing since the file was already
counted at 494 during this plan's research and other concurrent work on
`develop` may have nudged it since.

### 4. Optional: tile-menu title tweak
`client-tile-menu-title.ts` already returns a plain
`"Automated Fabrication Complex"` title for any `tile.afc` — leave as is
(out of scope, matches the existing plan note that this doesn't need an
icon/thumbnail change). Not doing this is not a gap; it's explicitly
deferred in the backlog item's own text.

### 5. Changelog
Required entry (AGENTS.md gate) once shipped: state plainly that this is a
presentation-only addition (tapping your own AFC now shows its docked
modules grouped by Economy/Manpower/War/Aether) and that it lists every
commissioned module regardless of whether that module has 3D/2D map art
yet — distinct from, and not blocked by, the "10 modules still missing 3D
art" caveat from the map-overlay changelog entry, so a player doesn't read
this as contradicting that one.

### 6. Docs
Update `docs/manifest-full-plan.md`'s "New: AFC tile overview UI" section
once implemented: mark it done, note the `branch` field was reused as-is
(no new Economy/Manpower/War/Aether mapping table needed — worth calling
out since the backlog item's own wording ("presumably grouped by...")
suggested this might need to be built from scratch).

## Explicitly out of scope here

- Any change to `Tile["afc"]` server-side shape, per-module dormancy
  flags, or the 8-socket cap — this reads existing data only.
- The AFC tile-menu title/icon (see step 4).
- Any interaction affordance beyond a read-only list (e.g. "tap a module
  row to jump to its tech-tree entry") — a nice-to-have, not requested;
  note it as a possible follow-up in the plan doc rather than building it
  speculatively.
