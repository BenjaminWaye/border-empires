# Frontier resource icon art

Status: implementation reference

## Current direction

Five-colour cel-shaded resource objects replace the earlier textured paintings.
Use large flat regions, a dark outline and one defining feature per resource.
The palette limits dominant paint colours; antialiased edges and export
resampling do not need to be palette-indexed pixels.

Resource/dock badges use charcoal circular discs and thin coloured rims at
close zoom, coloured dots when zoomed out. Both 2D canvas and true-3D share
the implementation. Close-zoom artwork retains at least 20px of drawing space;
the cutout may overlap the rim without being clipped.

Runtime assets: `packages/client/public/icons/resources/<name>-96.png` and
`<name>-256.png`. Map/inline use 96px, large HTML art uses a 96/256px srcset.
All five original assets use the built-in image-generation tool. Exports keep
alpha and use Lanczos downsampling. No third-party art ships.
Review Storybook `Map/Resources/Resource Badges → Painted Resources`.
Lore reviewed; no canon change.

## Prompt set

Concatenate the common prefix and each subject for the complete prompts.
All calls used `transparent_background: true`.

### Common prefix

> Use case: stylized-concept. Make ONE production strategy-game resource icon. FLAT CEL-SHADED illustrated game art, with exactly FIVE solid paint colours including outline. Broad confident shapes, thick smooth dark outline, no texture, no gradients, no reflections, no fine marks, no realistic rendering. Each object uses only 2-3 large internal colour regions; all detail must survive at 20px. Crisp antialiased edges are allowed. Original strategy UI illustration, sophisticated intentional silhouette, not a generic abstract symbol. Single isolated subject filling 86% of square canvas; generous even transparent safe margin; centered and balanced. No badge, circle, text, ground, scene, glow or shadow outside object. True transparent background.

### neural-resin

> Subject: one large chunky amber resin lump and one smaller nugget tucked at lower left; broad organic silhouette, one bold curved inner amber shape suggesting trapped biological material. FIVE COLOURS ONLY: nearly black brown #302522, deep burnt orange #9A481F, honey amber #E49A2D, pale golden highlight #FFE09A, muted inclusion brown #684126. Make the large nugget dominant and simplify into a few large smooth faceted planes.

Source: `exec-1f517a72-29ae-4193-a360-a8cfc7efecd1.png`.

### conductive-minerals

> Subject: a single solid chunky angular slate ore rock, with one thick S-shaped turquoise conductive seam crossing it diagonally; a small attached protrusion at lower right, all part of one rock silhouette. FIVE COLOURS ONLY: dark outline #202B32, deep slate shadow #3D5360, blue-grey base #718D99, pale stone highlight #C0D5CF, turquoise seam #48D8B2. Only 4 large rock facets, no small cracks or chips. The thick turquoise seam is the main identifying feature.

Source: `exec-439545d2-4cfa-40c2-8a36-47fbef2a4c35.png`.

### catalytic-deposit

> Subject: three rounded angular metallic mineral nuggets in a tight triangular pile: one tall nugget behind and two short nuggets in front. FIVE COLOURS ONLY: dark brown outline #302D28, taupe shadow #746951, champagne metal base #BBA77A, warm ivory highlight #F2DEAA, cool grey facet #9B9F98. Each nugget has just two or three broad flat planes. Natural metallic nuggets, not coins, not hexagons, not gemstones.

Source: `exec-c0a67626-a694-48b1-85bd-e1245ee05e01.png`.

### luxury-biota

> Subject: one compact magenta orchid bloom with three large rounded petals and a broad lower lip, golden central throat and two thick dark green leaves beneath. FIVE COLOURS ONLY: dark outline #302235, deep plum petal shadow #8D346B, rose magenta petal base #DF6AA4, golden cream throat and highlights #F6D794, muted jade green leaves #52795B. No thin stem, no veins, no spots, no many-petal flower. Strong broad flower-and-two-leaves silhouette.

Source: `exec-24b3e427-6c9e-4118-995d-df280b1ccc2b.png`.

### precursor-salvage

> Subject: one broken industrial machine housing, square-ish irregular dark steel casing with a visibly broken off upper left corner and a large brass circular fitting framing a dark central opening. Compact three-quarter view, 2 or 3 broad casing planes, one large ring and no tiny components. FIVE COLOURS ONLY: dark outline and inner aperture #252D32, steel shadow #4B606D, slate steel base #889DA5, ivory lit casing #DBDDC8, muted brass ring #C2A05A. No glow, no scratches, no screws, no wires, no symbols.

Source: `exec-86474f98-fae0-4b97-ae2b-5740af153ead.png`.
