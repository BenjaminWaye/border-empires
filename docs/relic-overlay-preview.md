# Relic ziggurat preview

Status: active proposal
Owner: Benjamin Waye (visual sign-off and relic fiction)
Last verified: 2026-10-23
Replacement target: the visual sections of [natural wonders](natural-wonders-design.md), if accepted and implemented in both map renderers.

## Direction

One shared surface building serves different buried Concordance installations.
The visible remnant is a weathered stepped ziggurat: broad terraces, chipped
corners and a service stair. Four short flights run alternately across the
front, joined by level landings, with an outer handrail and a final walkway
to the bulkhead. The door opening is the stair's scale reference: at a
nominal two-metre door, risers are roughly 18–20 cm and goings 32–42 cm.
Its space-age construction remains visible:
bleached composite skins over a dark structural chassis, sealed bulkheads,
maintenance catches, inset vents and severed utility connections. Missing
covers expose ribs and cables; detached skins, oxidation and some moss show
long disuse. Surviving machinery emits only faint light. Avoid stone-brick
masonry, the Waystation's shelter-and-mast
silhouette and the polished ring-and-fin design tried before this revision.

The proposed fiction is recorded as an open question in the
[world bible](lore/galactic-lore.md#14-canon-boundaries-and-open-questions).
Relics are immovable surviving portions of planetary infrastructure, left on
the world after a campaign. Their different benefits come from the underlying
installations. This preview does not establish new effects or accepted canon.

## Run and inspect

From the task worktree, after dependency installation and shared-package builds:

```bash
pnpm --filter @border-empires/storybook exec storybook dev -p 6017 --no-open
```

Open `http://localhost:6017/iframe.html?id=relics-buried-core--map-preview&viewMode=story`.
The comparison uses the production heightfield, atmosphere, Waystation, town,
forest and mountain models. The candidate is instanced procedural geometry;
the wear shader uses object coordinates so it does not slide when viewed from
another angle.

- Map scale: nearby comparison with the existing models at native size.
- Game zoom: distance 38 and tilt 0.6, matching the game's default-camera reference.
- Close view and Top down: inspect the silhouette and surfaces.
- Captured/Unclaimed: toggle faint operating lights and a House banner above
  the summit. Capturing hoists its telescoping mast and unfurls the cloth
  over 1.6 seconds; opening the Captured story shows the completed state.
  The cloth reuses the production muster banner's shape, trim and wind
  shader. This replaces the large terrace colour panels, while giving
  ownership its own silhouette above the wide base that hides the tile's
  tint. The weathered structure stays unchanged. Territory tint is not
  included in this isolated building preview.
- Captured and Captured On Map stories open directly in the owned state;
  Storybook's owner-colour control changes the banner cloth.
- Human scale toggles an optional 1.7 m reference figure beside the nominal
  two-metre door. It is a preview aid, not a gameplay character.
- Drag to orbit and scroll to zoom.

Source is isolated under `packages/storybook/src/relics/`. It is not wired
into either live map renderer. The requested prototype covers 3D only; a 2D
counterpart and runtime integration remain required before shipping. The
visual foundation extends beyond the central tile without changing terrain,
placement, ownership, visibility, rewards or existing wonder effects.

## Verification

Run Storybook's TypeScript check and production build, file-line checks and
documentation checks. Inspect the comparison, close-up, top view and both
capture states in a browser. No client changelog entry is needed for this
isolated design preview; a live visual replacement will require one.

The prototype passes the Storybook TypeScript check, its isolated Vite
production build, file-line checks and documentation checks. The full
Storybook build is blocked by an existing missing
`client-resource-discovery-info-style.css` import in `GroupedBuildingMenu.stories.ts`.
