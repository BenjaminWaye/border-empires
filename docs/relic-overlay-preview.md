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

## Remaining work and decisions

Plan updated: 2026-10-23. This is a proposed implementation sequence, not
authorization to change balance, generation or campaign persistence.

### Working direction established in this thread

- One shared, disused space-age ziggurat marks the surface access to many
  kinds of buried Concordance installations. The underground installation
  explains the benefit; the ziggurat itself is not a universal factory.
- Sites are fixed remnants of planetary infrastructure, left on the planet
  after a war game. This fiction does not settle ownership between campaigns.
- Capture raises a House banner and wakes restrained operating lights. Keep
  the old structure weathered. Human-scale steps and landings remain part
  of the model.
- Capture illustrations use the painted armour-works image as the style
  reference. The rejected small model section is not the target art style.
- Everything implemented so far remains a local Storybook prototype. The
  approved artwork is saved but is not yet displayed in the dialog.

### Delivery order

1. **Finish one complete example.** Replace the Warpress dialog's 3D section
   with the painted artwork. Recompose for desktop and phones without
   cropping away either the surface building or the underground works.
   Remove the section toggle and numbered model annotations from the painted
   version. Keep the benefit, ownership condition and accessible description.
   Export an optimized web image; retain the source and generation prompt.
   This image works without WebGL and should be shared by both renderers.
2. **Audit and define the full catalogue.** For each of the nine current
   types, record the actual runtime effect, proposed installation, player
   name, short lore explanation and required illustration. Preserve numeric
   behavior unless a separate balance decision is made. Reconcile shared
   labels and docs with runtime behavior, including the Watchtower's actual
   Observatory role/radius, Conscription's site-wide first-claim reward, and
   the Foundry's actual resource types. Explain empire-wide benefits without
   assuming new cities can be placed or inventing new resource transport rules.
3. **Produce the illustration set.** Use the accepted composition, materials,
   wear and lighting for one illustration per approved installation family.
   Show genuinely different useful machinery below the same surface access.
   Finalize family identities before generating the full set. Include
   image alternatives and responsive exports; decide how baked-in banners
   and insignia relate to dynamic House ownership.
4. **Integrate map rendering.** Move the approved surface model and banner
   lifecycle into the client; add the matching ziggurat and ownership flag
   to the 2D canvas path. Test normal gameplay zoom, neighbouring structures,
   slopes, coasts, fog and selection. Preserve one logical tile and ensure
   overhanging geometry does not obscure interactions on nearby tiles.
   Loading an already-captured site must not replay the capture animation.
5. **Integrate the capture experience.** Use the authoritative claim event
   and actual local ownership to display the dialog, with correct artwork,
   name and benefit. Handle initial capture, recapture, loss, reconnect,
   historical events and multiple queued captures without duplicate popups
   or revealing unseen enemy ownership changes. Let players reopen the
   illustration and effect from the relic's tile information. Show one-time
   rewards only when actually awarded; preserve cooldowns on owner changes.
6. **Implement planet variation after its rules are decided.** The current
   generator attempts one of every nine types, omitting a type if placement
   fails. Seven sites per planet is a new rule, not current behavior. Add
   deterministic selection, count/spacing rules, valid-terrain fallbacks and
   small-map checks once agreed. Check AI handling of missing types and
   compatibility with existing saved worlds. Do not regenerate live worlds
   merely to apply a presentation update.
7. **Finish and release.** Move accepted fiction out of the world bible's
   open questions; update gameplay references, shared player-facing labels
   and the client changelog. Verify gain/loss of all benefits, one-time
   rewards and daily/casting cooldowns; capture notification lifecycle;
   both map renderers; phone layout; keyboard/screen-reader behavior;
   reduced motion; image loading and performance. Run required local CI
   before opening the feature PR against develop, then verify PR CI.

The presentation work can ship independently of planet-selection changes.
The release scope should say explicitly whether it preserves existing
world placement or includes the new seven-site rule.

### Decisions still required

| Decision | Recommendation / starting point |
|---|---|
| Nine identities and their effects | Retain the nine effect families initially. Finalize the underground installation and name for each before commissioning all artwork. Armour Works/Warpress and Computation Vault/Calculating Engine are examples, not a completed catalogue. |
| Difficult fictional mappings | Resolve especially the Foundry's mix of resource slots, Conscription's manpower reward, and how local installations benefit distant docks or forts. A factory must not conjure people; names and explanations need to reflect what manpower represents. Check the existing economy lore before choosing the mechanism. |
| Why they survive and can be used | Settle why the Wardens missed these remnants and why a Duke can reactivate them despite the frontier's established aether danger. A sealed, dormant installation with only part of it recoverable is a candidate explanation; new immunity or risk mechanics are not assumed. |
| Seven per planet and small maps | If seven is the target for normal worlds, select seven distinct families from the nine. Decide whether smaller maps use fewer, and what happens when terrain/spacing cannot fit the target count. Avoid duplicate families initially: current runtime benefit sets do not make duplicate copies stack. |
| Identity across 100+ planets | Reuse installation families and their illustrations, with seeded site names/designations and suitable local context. Keep a clear family/effect label alongside the individual name. This gives variation without 700 unique effects or illustrations. Decide how much per-planet visual variation is actually needed. |
| Discovery, light column and minimap | Start with exploration-gated discovery and a persistent marker once found. A House banner handles ownership. Decide separately whether strategic relic locations are public from the beginning, whether a distant light column is needed, and whether it can appear through unexplored fog. Never expose current enemy ownership beyond the chosen information rules. |
| Capture versus activation | Use existing tile capture to activate the benefit automatically; add no repair currency, activation fee or extra action for the initial release. Decide separately if reactivation risk or repair gameplay is wanted later. |
| Capture-dialog timing | Show the reveal on the player's first capture of a site, queue it after action resolves, and use a smaller notification on later recaptures. Keep the full illustration available in tile info. Confirm this frequency before wiring events. |
| Ownership in illustrations | Prefer neutral insignia in reusable paintings and dynamic House colour in UI/map banners. The current artwork's blue banner is illustrative; choose whether to neutralize it or provide a dynamic treatment before release. |
| Footprint and campaign persistence | Preserve one logical capture tile. Confirm acceptable visual overhang. Keep physical persistence separate from ownership/bonus persistence across campaigns; the latter remains part of the world bible's unresolved campaign rules. |

**Next concrete milestone:** one finished Warpress capture dialog using the
painted artwork, followed by the nine-row installation/effect/name catalogue.
No further full-set art production should depend on unresolved identities.
