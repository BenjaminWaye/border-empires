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

## Capture dialog proposal

Open `http://localhost:6017/iframe.html?id=relics-capture-dialog--armour-works&viewMode=story`.
The native capture dialog shows the actual ziggurat and raised House banner
above a diagrammatic section through the ground. Numbered annotations identify
surface access, the service shaft and the buried installation. The existing
gameplay benefit is explained beneath the graphic, with a reminder that it
lasts while the relic is held. Continue, close and Escape dismiss the dialog;
the preview's Show capture dialog button reopens it. Cutaway view toggles
the near wall and underground annotations. The illustration includes a text
alternative, and the layout adapts to phone widths.

Armour Works uses the Warpress's current mustering benefit. Computation Vault
shows the same surface model over calculation banks, with the Calculating
Engine's research-coin discount. The buried armour works and computation
vault are proposed explanations, not new effects or accepted canon. Both
variants reuse the existing model and muster cloth, with scoped dark iron,
parchment, brass and verdigris styling based on the client theme. The section
is illustrative and not to scale; it does not enlarge the relic's tile or
create traversable underground gameplay.

This is a Storybook dialog preview only. It is not connected to capture
events or either live map renderer. Its graphic currently requires WebGL;
a non-WebGL graphic remains required before shipping to the 2D fallback.

Source is isolated under `packages/storybook/src/relics/`. It is not wired
into either live map renderer. The requested prototype covers 3D only; a 2D
counterpart and runtime integration remain required before shipping. The
visual foundation extends beyond the central tile without changing terrain,
placement, ownership, visibility, rewards or existing wonder effects.

## Painted capture artwork

The preferred visual direction is now the generated
[armour-works artwork](../packages/storybook/src/relics/artwork/armour-works-v1.png),
with its [generation prompt](../packages/storybook/src/relics/artwork/armour-works-v1.prompt.txt).
It replaces the small, literal model section as the illustration direction:
a weathered surface ziggurat opens into a far larger buried industrial
installation, mostly abandoned with a surviving armour line. The original
image is preserved alongside its built-in image-generation prompt. It is an
artwork candidate; the Storybook dialog still uses the earlier 3D graphic.

## Verification

Run Storybook's TypeScript check and production build, file-line checks and
documentation checks. Inspect the comparison, close-up, top view and both
capture states in a browser. No client changelog entry is needed for this
isolated design preview; a live visual replacement will require one.

The prototype passes the Storybook TypeScript check, its isolated Vite
production build, file-line checks and documentation checks. The full
Storybook build is blocked by an existing missing
`client-resource-discovery-info-style.css` import in `GroupedBuildingMenu.stories.ts`.
