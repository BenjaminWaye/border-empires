# Storybook

Visual catalogue of the game's map art, effects and UI, rendered from the
client's real code.

```bash
pnpm --filter @border-empires/storybook dev              # http://localhost:6006
pnpm --filter @border-empires/storybook storybook:build  # static build in storybook-static/
pnpm --filter @border-empires/storybook test             # structure guardrails
```

## Layout

The sidebar is organised by what the player sees, and the folders under
`src/` mirror it: a story's `title` starts with its folder path in Title Case
(`src/map/structures/watchtower/Watchtower2D.stories.ts` →
`Map/Structures/Watchtower/2D`). A feature's 2D and 3D renderers sit next to
each other, so a missing renderer is visible at a glance.

| Folder | Sidebar | What goes there |
|---|---|---|
| `map/terrain` | Map/Terrain | Heightfield, water, rivers, hills, forest, mountains |
| `map/resources` | Map/Resources | Deposits, farmland, fishing, prospect clues |
| `map/structures` | Map/Structures | Town, fort, watchtower, waystation, relay beacon, other buildings, construction |
| `map/afc` | Map/AFC | Fabrication Complex, the module gallery, delivery and drop FX |
| `map/natural-wonders` | Map/Natural Wonders | Every wonder from the shipped overlays |
| `map/overlays` | Map/Overlays | Ownership, reach, frontier supply, roads, incursion breach, … |
| `map/badges` | Map/Badges | Tile badges, floating text, waypoint flag |
| `map/combat` | Map/Combat | Attack, muster, popup marines |
| `map/abilities` | Map/Abilities | Aether and monument ability effects |
| `ui/*` | UI/… | HUD, tile menu, panels, space view |
| `assets` | Assets | Raw asset galleries (every SVG in `client/public/overlays`) |
| `history` | History | Retired designs kept as a record of the game's development |
| `sandbox` | Sandbox | Proposals that are not shipped yet |
| `fixtures` | — | Shared stages, lighting, labels and demo worlds; no stories |

## Current structure identity review

**Map / Structures / All Structures / All Kinds** derives every buildable choice
from the current registry and dispatches to the same 3D overlay family as the
live map. It shows the canonical name, verified gameplay role and visible
landmark. **Town / District / Identity Review** focuses on the 41 current
support models; retired save types have a separate compatibility review.
Superseded bespoke support studies are labelled Legacy.

## Rules

`src/guardrails/story-structure.test.ts` enforces these in `pnpm test`:

- Every story's title root is `Map`, `UI`, `Assets`, `History` or `Sandbox`,
  and its title matches its folder.
- Stories under `map/` and `ui/` render client code (`@client/...` or a
  workspace package, directly or through a fixture). A hand-built prototype
  of a model or panel goes in `sandbox/`.
- No file imports from a `*.stories.ts` file. Shared helpers live in `fixtures/`.
- Every relative and `@client/` import, CSS included, points at a file that exists.
- A `sandbox/` story declares `parameters: { sandbox: { owner, added } }` and
  is promoted or deleted within 30 days of `added`.

UI stories that need the game's global styles import `@client/client-styles.js`,
the same stylesheet list `main.ts` loads, instead of copying CSS imports.

## History

When a shipped design is replaced, snapshot the outgoing client code into
`src/history/<subject>/<yyyy-mm-slug>/` (a header comment naming the source
path and commit) and register it in that subject's era list. See
`src/history/town/town-eras.ts` for the town's eras. Retired binary assets an
era needs go in `public/history/`, served at `/history/`.
