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

The shared premise is recorded in the
[world bible](lore/galactic-lore.md#surviving-relic-installations); remaining
catalogue questions are tracked in its §14.
Relics are immovable surviving portions of planetary infrastructure, left on
the world after a campaign. Their different benefits come from the underlying
installations. The shared-interface and dormant-aether-machine premise is now established in
the world bible. Specific installation/effect mappings below remain proposals;
this preview does not establish new effects.

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

### Decisions confirmed on 2026-10-23

- The machines are aether-powered. Their activity attracts Wardens, which is
  why locals have left them dormant. This premise is now in the world bible;
  Houses gain no new immunity from the existing aether danger.
- Seven relics is the target for a normal planet. Small-map counts and
  placement-failure handling still require a specific generation rule.
- A distant locator light should be discoverable through unexplored land
  once the player gets close enough. Exact detection distance, minimap
  behavior and the information exposed by the beam remain undecided.
- Activate through ordinary tile garrison. There is no separate activation
  action in the initial implementation. Preserve the distinction between
  being detected, being captured and being garrisoned when wiring events.
- Show the full reveal on the player's first capture of a site and a smaller
  notification on subsequent recaptures; keep the full artwork in tile info.
- Use neutral insignia in reusable paintings and dynamic House colour in
  the interface and map banner.

### Future design ideas retained

**Repair costs and reactivation risks:** explore bringing a damaged
installation back online, resource or manpower repair costs, Warden attention
or other consequences of restarting its aether plant. These ideas are retained
for a later design pass. No cost, probability, encounter or extra activation
step has been selected. The initial release must not silently add them.

### Proposed mappings of existing effects to installations

These are fiction candidates for the current effects, not approved final
names or rule changes. Ongoing benefits need an ongoing service or output:
losing the site should stop that contribution without pretending that a House
forgets knowledge or that permanent retrofit parts disappear.

| Current family | Proposed buried installation | How the current effect fits |
|---|---|---|
| Foundry Heart | Integrated reclamation works | Surviving nutrient-recovery, material-refining and Crystal-conditioning lines add usable supply capacity. FOOD, TITANIUM, CRYSTAL and UMBRITE slots represent capacity, not a pile of free resources. This must be a broad industrial complex, not just a metal foundry. |
| Deepwater Engine | Tidal freight and naval-support complex | Continuous cargo handling and dock coordination increase trade throughput; naval servicing and deployment support improve dock-launched attacks. Explain an ongoing service to House docks, rather than a local pump somehow doubling distant income. |
| Conscription Engine | Somatic reserve and recovery complex | A finite stock of preserved/remade bodies could explain the site's once-only manpower grant, while recovery/support infrastructure supplies the additional manpower cap. This is the hardest mapping and needs a deliberate decision about bodies and preservation; armour production alone cannot create manpower. |
| Warpress | Automated armour works | Continuous equipment output supports faster mustering and another simultaneous formation. The accepted painting establishes its visual direction. It does not create people. |
| Bastion Frame | Defensive field-control installation | An operating aether lattice supplies reinforcement to House-held forts. Continuous reinforcement explains why the bonus ends with control of the installation; permanent construction upgrades would not. |
| Calculating Engine | Fabrication and calibration computation vault | Ongoing calculations reduce the cost of commissioning and calibrating campaign technology. House knowledge is retained: this is not rediscovering forgotten science. Ensure the player-facing text respects the Manifest/commissioning model in world-bible §§11–12. |
| Quickforge | Rapid precision-fabrication cell | Limited daily output of specialist components offsets part of one construction rush purchase. The numerical allowance and UTC reset remain gameplay abstractions, not a claim that the factory produces only one object per day. |
| Watchtower Engine | Self-supplied aether projection installation | A surviving projection and power core provides the Observatory capability without the normal Crystal-slot demand. Use the runtime Observatory behavior, not the stale label promising a separate +10 radius. |
| Cartographer's Lens | Planetary survey-network controller | Buried processing machinery coordinates surviving sensors and House-held survey coverage, extending vision from held ground. This is a sensing service, not a telescope that can see through soil. |

### What variation across 100+ planets means

The reusable unit is an installation family with a known effect and artwork.
For example, two planets may both contain an armour works: one is an old
expeditionary-armour line, another a vehicle-armour reclamation facility.
Their names and industrial histories can differ while the Warpress effect is
recognizable. Such distinctions are flavour unless a separate rule changes.

Selecting seven distinct families from nine gives only **36 possible family
sets**. More than 100 planets therefore repeat some sets. Their placement,
terrain, approach routes, competing settlements and omitted families change
the strategic situation; seeded names alone are cosmetic variation. We should
not promise 100 mechanically unique catalogues. If a unique seven-family set
for each of 100 planets becomes a requirement, ten families would permit 120
sets, but adding a tenth effect is a separate scope and balance decision.

Recommended initial scope: seven sites selected from the nine current
families, seeded placement and site names, and a shared family illustration
set. Add extra family-specific art variants only after the core set is good.

### Remaining precise choices

- **Conscription's bodies:** accept a somatic reserve/recovery explanation,
  choose another lore-compatible source of bodies, or revise that effect in
  a separate balance change. Do not describe equipment as manpower.
- **Other installation mappings and names:** review the candidates above
  before final copy and the remaining full-set artwork are produced.
- **Locator beam:** choose detection distance and its origin measurement,
  minimap discovery behavior, and whether discovery persists. Recommended:
  proximity reveals a site marker, with no live enemy owner information
  through fog. An independently, conventionally powered locator is a proposed
  way to show a beam while the main aether machinery remains dormant.
- **Generation:** choose small-map counts, missing-terrain fallbacks and
  whether seven distinct families can always be placed at required spacing.
- **Footprint:** one logical tile is captured/garrisoned. Decide how far its
  artwork may visually overhang adjacent tiles without masking their contents
  or interaction. The painted underground complex has no map footprint.
- **Persistence:** the physical ruin remaining on a planet is established.
  Whether a House still owns it after a campaign reset is a different rule,
  tied to the world bible's unresolved permanent-holdings question. Do not
  change ownership reset behavior as a side effect of this feature.

**Next concrete milestone:** one finished Warpress capture dialog using the
painted artwork, followed by the nine-row installation/effect/name catalogue.
No further full-set art production should depend on unresolved identities.
