# Resource icon art

Status: implementation reference

## Current direction

Limited-palette cel-shaded resource objects replace the earlier artwork.
Use large flat regions, a dark outline and one defining feature per resource.
The palette limits dominant paint colours; antialiased edges and export
resampling do not need to be palette-indexed pixels.

Resource/dock corner badges use charcoal circular discs and thin coloured rims
at close zoom, coloured dots when zoomed out. Below 16px tiles, docks retain
the existing square full-tile marker so the anchor stays visible. Both 2D
canvas and true-3D share the implementation. Close-zoom artwork retains at least 20px of drawing space;
the cutout may overlap the rim without being clipped.

Runtime assets: `packages/client/public/icons/resources/<name>-96.png` and
`<name>-256.png`. Map/inline use 96px, large HTML art uses a 96/256px srcset.
The original cutout assets use the built-in image-generation tool. Exports keep
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

## Core resource extension

Coin, Food/grain, fish, titanium and Umbrite use the same common prompt prefix
and limited-palette style above. Fish is a client artwork key only: farm and
fish tiles still resolve to the same FOOD supply. The HUD, upkeep, diplomacy
and food-shortage indicators keep the FOOD/grain icon. Existing source colours
remain yellow-green for farms and blue for fish; no economy rules change.

Runtime paths follow the same 96/256px PNG convention for `gold`, `food`,
`fish`, `titanium` and `umbrite`. Core review: Storybook `Core Resources`.

### gold

> Subject: ONE thick round gold credit coin, viewed almost straight on with a slight three-quarter tilt so a narrow lower-right edge shows thickness. A broad raised outer rim and one large simple diamond stamp in the centre; maximum two concentric shapes. FIVE SOLID COLOURS ONLY: dark brown outline #3A2B1D, bronze shadow #976126, gold base #DDA43A, warm gold highlight #F7D16E, pale cream brightest face #FFF0BE. Restrained elegant official token silhouette. No piles, no letters, no numbers, no intricate minting, no many edge grooves.

Source: `exec-3cd748b5-0a26-40ec-b889-2f38d17b6f4d.png`.

### food

> Subject: a compact tied bundle of TWO golden grain ears with just four large seed lobes per ear, broad overlapping green leaves at the base and short thick stems. Strong simple harvested grain silhouette usable both for general FOOD and for farm tile supply. FIVE SOLID COLOURS ONLY: dark brown-green outline #353426, amber shadow #AA7930, golden grain base #E3BC54, cream grain highlights #F5DFA0, muted leaf green #6D8E54. Make ears stout and full, avoid long thin stalks, tiny kernels, scratch lines or fine awns. No basket, pot, scene, bread or vegetables.

Source: `exec-d51762e0-b39c-45c1-b513-e679f6536837.png`.

### fish

> Subject: ONE plump silver-blue food fish seen from the side, facing left, broad oval body, large simple forked tail on right, one thick top fin and a dark eye, no scales. Almost horizontal but tilted slightly upward to fill a compact square silhouette. FIVE SOLID COLOURS ONLY: dark blue outline and eye #253B48, deep teal-blue shadow #477787, pale slate-blue body #87B7BE, warm ivory belly and upper highlight #DEE7CF, muted sage fin accent #8C9E6F. Thick rounded fins, no spines, stripes, gill details or scenery. A recognizable edible fish, not a fishing hook or boat.

Source: `exec-867fa6f7-250e-4568-b1b8-fb1e4952f033.png`.

### titanium

> Subject: ONE solid rectangular titanium ingot in a strong three-quarter view, broad bright trapezoid top, light grey front face and dark steel right end, thick dark outline. Clean industrial metal silhouette with just one broad pale top-edge highlight. FIVE SOLID COLOURS ONLY: dark blue-grey outline #2B3945, steel shadow #586D7B, cool grey base #9DACB3, pale silver top #DCE2DF, warm ivory highlight #F4F0DC. Strong geometric mass, not a rock or crystal, no text, stamps, scratches, reflections or stack of many bars.

Source: `exec-7db59888-26cd-48fa-9f32-f65d8d65ca65.png`.

### umbrite

> Subject: ONE broad rough angular Umbrite ore chunk, low compact rock silhouette with a smaller attached lobe, four broad faceted planes, a single large pale violet triangular exposed face. Deep dark violet military ore, not a shiny gemstone, magic crystal or glowing orb. FIVE SOLID COLOURS ONLY: near-black plum outline #292132, deep purple shadow #493356, muted violet ore base #775A8B, lavender exposed face #AA8FBE, pale lilac highlight #D7C4DF. Very broad matt facets, no veins, glitter, little chips, internal symbols or glow.

Source: `exec-7e66a63d-bd3c-4cee-a74c-43e3af9195d3.png`.

The Food export received one built-in cleanup edit:

> Remove only the tiny stray grey circular speck near the lower-right outside the grain bundle. Keep the golden grain bundle exactly as it is: same silhouette, colours, size, position and style. Keep the transparent alpha background. Do not add anything or change any detail of the grain. This is cleanup of an isolated unwanted background speck only.
