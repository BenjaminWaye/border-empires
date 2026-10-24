# Concordance relic installations

Status: canonical gameplay reference for newly seeded worlds

Relics are surviving fixed Concordance installations. Their common weathered
space-age ziggurat is an access building, not the complete installation.
A planet normally selects seven different families from nine using its seed.
Each family occurs at most once. Maps smaller than 1,400 tiles reduce this to
`max(1, floor(area / 200))`; placement can still omit a site when no vacant land
satisfies spacing. Preferred biomes are attempted first, with vacant-land
fallback. Sites avoid docks, towns, resource clusters and each other.

Seven of nine produces 36 possible family sets. Planet identity also varies
through terrain, placement, reclamation allocations and the history of captured
and depleted sites. Family sets can recur across a catalogue of 100+ planets.

The logical footprint is one capturable tile. The decorative model overhangs
that tile; it does not prevent construction on neighboring tiles. Garrisoning
(SETTLED ownership) activates a surviving installation. Frontier ownership does
not activate it. A banner shows the owner independently of the ground tint.

| Installation | Effect while held and garrisoned |
|---|---|
| Reclamation Works | Allocate one already-revealed strategic resource, weighted toward shortage. +4 Titanium, +2 Crystal or +1 Umbrite capacity. The allocation belongs to the site; a subsequent owner must reveal that resource to benefit. An installation captured before any eligible reveal waits for a resource reveal. |
| Antimatter Drive Works | Dock income ×2. Dock-launched attacks gain ×1.15 strength and take 25% less time, subject to the normal minimum resolve time. |
| Ancillary Vault | First garrison recovers 2,000 manpower from a single reserve, held above the ordinary cap until spent. No recurring cap increase. Recovered bodies remain with the recipient after capture. |
| Combat-Suit Factory | Next 100 accepted ATTACK deployments gain ×1.5 strength. Each launch consumes one reserve; rejected commands do not. |
| Ancient Field Generator | Garrisoned owned land within wrapped Manhattan radius 3 receives ×1.5 defense, for 30 accepted defensive engagements. This consumes field cells and is separate from AFC Bastion wards and Aether Tower protection. |
| Fabrication Coordinator | +1 simultaneous Development project. No Manifest discount. Losing the site does not cancel projects already underway. |
| Nanofabricator Reserve | Five successful rush purchases receive up to 40 Coin subsidy each. No daily reset. A zero-price base purchase consumes no dose. |
| Concordance Resonator | Acts as an Aether Tower with 50-tile casting reach and no Crystal-slot demand. Normal vision and protection radii remain independent. |
| Subsurface Survey Array | Show strategic resource signatures within wrapped Manhattan radius 12, including unexplored ground, for resource types already revealed by the holder. No terrain, ownership or army intelligence. |

Reserves are stored on the site, survive recovery/restart and owner changes,
and never refill through recapture. Battle results and their modifiers are
fixed at launch, so the final spent charge still benefits its committed battle.

A dormant installation is sealed and unlit. An operating installation has muted
interior lighting. A depleted ruin remains selectable and capturable, retaining
its House banner but losing its operating lights. Both renderers show a crossed
empty-cell symbol and the tile information/dialog says **Depleted**.

A maintenance transponder identifies a relic's location once a House has a
garrison within 12 tiles. The anonymous column can appear through unexplored
ground and is marked on the minimap. The signal discloses no installation type,
owner or current reserve. A remembered depleted site suppresses its beam and
uses a crossed minimap marker. Known ruins remain marked after leaving proximity range. Both renderers retain
a sealed ruin in remembered terrain, using the last observed banner and reserve.
Hidden capture or reserve changes do not update that remembered state. Survey signatures use separate resource markers and
vanish when their source is no longer held and garrisoned.

First capture by a player opens a painted installation reveal; subsequent
recaptures use a small notice. “View relic installation” in the tile overview
reopens the full details. Artwork illustrates machinery rather than its exact
live condition; authoritative status and reserves are in the accompanying copy.

Compatibility: only new worldgen emits `relicVersion: 1`. Existing unversioned
wonders retain their original effects and overlays. No live-world regeneration
or implicit save migration occurs. Legacy rules are retained in
[natural-wonders-design.md](natural-wonders-design.md).

Implementation: [shared catalogue and lifecycle](../packages/shared/src/relics/relic-state.ts),
[simulation effects](../apps/simulation/src/runtime-relics.ts),
[world selection](../packages/game-domain/src/server-worldgen-natural-wonders.ts),
[map hint projection](../apps/simulation/src/runtime-relic-map-hints.ts),
[shared capture dialog](../packages/client/src/client-relic-dialog/relic-capture-dialog.ts).

Repair costs, activation encounters and random breakdowns are retained future
ideas. They are not part of these rules. Numerical values are initial balance
defaults; their fictional meaning is established in the [world bible](lore/galactic-lore.md#surviving-relic-installations).
