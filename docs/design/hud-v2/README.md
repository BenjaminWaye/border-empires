# HUD v2 design drafts

Status: reference snapshot (exported 2026-10-31)

These are repo copies of the claude.ai design artifacts behind the desktop HUD
overhaul (HUD v2). The live originals can still change; these copies are what
the shipped HUD was built against. Re-export them here if the drafts change in
a way the code should follow.

| Folder / file | What it is | Live original |
|---|---|---|
| `hud-draft/` | The HUD design canvas: seven artboards (map, battle, battle in progress, town, manifest tree, action bar states, Chronicle) | https://claude.ai/artifact/QsqM1qs8kK8WRhtNpgW9dB |
| `ui-teardown.html` | Teardown of the legacy desktop UI that motivated the redesign | https://claude.ai/artifact/KhmmkMupU1R5dWrjcEW7UB |
| `resource-icons/` | Resource icon trials: the rejected AI-painted sheets (`ai/`) and the chosen simple icons (`final/`, 48/72/96 px) | https://claude.ai/artifact/3cQuQoMzaJrZGZNmTsmZE6 |
| `town-build-progress.html` | Draft: the shipped town screen with a support tile selected that has a queued or running build (Jump to front, Rush, Cancel above the build list). Links the live HUD v2 stylesheets; open it from the checkout | — |
| `empire-domains.html` | Table of every Empire Domain and its effects, from `packages/game-domain/data/domain-tree.json` | https://claude.ai/artifact/DDSRuMnBwHSik4YzfBwQGc |

The live originals are private to their owner's claude.ai account; ask them to
share a link if you need the editable version.

## Opening them

- `ui-teardown.html`, `empire-domains.html` and `resource-icons/index.html`
  open directly in a browser.
- The `hud-draft/*.dc.html` artboards are source for the design canvas. They
  load a canvas runtime (`support.js`) that is not in the repo, so they do not
  render standalone. Read them as markup: the layout and copy are inline, and
  each file's `<script type="text/x-dc">` block holds the sample data and
  interactive states. `canvas.json` gives each artboard's title and size.

| Artboard | Shows |
|---|---|
| `Main.dc.html` | Map screen: resource bar, nav, tile dock, action bar, tracker, manpower orb |
| `Battle.dc.html` | Attack preview: both sides' modifiers, win chance, effort levels |
| `BattleLive.dc.html` | Battle in progress and resolved (captured / defender held) |
| `Town.dc.html` | Town screen: stats, built list, build list, support-ring focus |
| `Manifest.dc.html` | Manifest (tech) tree |
| `Actions.dc.html` | Action bar states per tile type |
| `Chronicle.dc.html` | Chronicle: Yours / World / Updates |

## Where the code is

- The only HUD, on desktop and phones (the classic HUD and its `?hud=legacy`
  opt-out were removed on 2026-11-07). Phones (≤ 900px wide, or a touch screen
  ≤ 500px tall) get the compact layout (`body.hud-v2-compact`,
  `client-hud-v2-compact*.css`/`.ts`, chosen by `client-hud-v2-layout.ts`).
  See `../../hud-v2-mobile-plan.md`.
- Modules: `packages/client/src/client-hud-v2/`. `client-hud-v2.ts` is the
  controller (250 ms frame, writes only regions that changed),
  `client-hud-v2-context.ts` holds shared deps and screen state, and
  `client-hud-v2-screens.ts` routes full screens.
- Some screens host or restyle older panel DOM rather than rewriting it: the
  trade view, AFC panel, Economy, Settings and the rest of `#side-panel`, and
  the floating tile menu (docked into the tile bar; its Modules, Commit and
  Reports tabs have no v2 view yet).
- Chronicle replaced the old activity dashboard and What's New.
- HUD changelog notes live in
  `packages/client/src/client-changelog/client-changelog-hud-v2-preview.ts`.
- Ranks top three come from `contenders` on the season victory objective
  snapshot (`packages/shared`), filled by the simulation.

## Shipped so far

PRs #2498 (screens), #2503 and #2504 (two rounds of staging feedback), all
merged to `develop`. Since #2587 it is the default desktop HUD; the classic
HUD was removed on 2026-11-07.

Known gaps at export time: no mobile layout (since built, see [`../../hud-v2-mobile-plan.md`](../../hud-v2-mobile-plan.md)); a profile opened from Ranks closes
to the map; a tile with both a fort and an economic structure only describes
the economic one; the Economic Hegemony "you" marker sits too far back.
