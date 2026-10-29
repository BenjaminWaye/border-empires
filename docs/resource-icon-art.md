# Frontier resource icon art

Status: implementation reference

## Direction and runtime assets

Original transparent painted objects, using the broad shading, strong outlines
and compact silhouettes studied in [Sam Gauss’s Civilization VI icon sheet](https://samgauss.artstation.com/projects/1Gyb8).
The reference artwork is not shipped or embedded in the game.

The five resources use `packages/client/public/icons/resources/<name>-96.png`
and `<name>-256.png`. Map and inline icons use the 96px export; large HTML art
slots use the 96/256px srcset. Existing base resource SVGs are unchanged.
The shared corner-badge renderer supplies both 2D canvas and true-3D; its
zoomed-in plate leaves at least 20px for the object. Below 48px tiles it retains
colour markers. Review with Storybook `Map/Resources/Resource Badges`.

Generated with the built-in image-generation tool. Exports preserve the source
alpha and use Lanczos downsampling. The originals remain in the local generated
image library. Only the two runtime sizes per resource ship. Lore reviewed;
no canon change. Asset quality is assessed visually at map sizes, not inferred
from successful generation or passing tests.

## Prompts

The four prompts below each concatenate this common prefix and their subject
verbatim:

> Use case: stylized-concept. Production game UI resource icon for Border Empires, single original cutout asset. Art direction: premium hand-painted strategy resource icon, broad three-tone shading, bold nearly black silhouette outline, creamy top-left highlights, saturated material midtones and deep lower-right shadows, convincing three-quarter volume, the craft of professional Civilization VI-era resource illustrations, original subjects not a recreation. Crucial: compact instantly identifiable silhouette readable at 16 and 24px, only 1-3 large masses, avoid fine texture and decorative detail. Fill 88% of a square with 6% transparent safe padding, centered square composition. No text, letters, border, hexagon or badge, no surface, no ground, no shadow outside the object. True transparent alpha background. Subject:

### Conductive minerals

> CONDUCTIVE MINERALS: one chunky irregular dark slate ore nugget with an attached smaller ore piece at lower right. Angular mineral facets with a thick bright turquoise copper seam winding through the main mass, muted teal-grey stone, luminous mint vein, broad silver-cyan lit upper facets. A solid mineral rock, not a symbol or a star, not a cut gemstone. Strong irregular chunky silhouette.

Source: `exec-81660e79-276c-4f46-98b9-580915ff0831.png`.

### Catalytic deposit

> CATALYTIC DEPOSIT: three dense naturally occurring platinum-palladium metallic nuggets in a tight triangular pile, one tall rear nugget and two smaller low front nuggets. Irregular softly faceted mineral masses, pale champagne silver metal, warm ivory bright highlights and deep taupe shadows. Earthy precious industrial catalyst material, not gold coins, not crystals, no hexagon or honeycomb symbol. Strong cluster silhouette.

Source: `exec-8d766d69-a6bc-4a64-b63f-f28d7458e289.png`.

### Luxury biota

> LUXURY BIOTA: a single striking native orchid flower cut with two broad dark green leaves, compact harvested luxury botanical specimen. Three large fuchsia-magenta upper petals, broad pink lower lip, rich golden saffron throat, pale pink top-edge highlights, deep plum shadows, broad rounded glossy green leaves angled beneath flower. Natural sophisticated botanical object, not an abstract flower logo, no pot, no long thin stem. Dominant pink flower fills top two thirds and two thick green leaves fill lower third. Broad simple petal forms.

Source: `exec-6beed9c0-c190-4ceb-9563-4d34f617d804.png`.

### Precursor salvage

> PRECURSOR SALVAGE: one broken ancient industrial machine module recovered from a wreck, compact worn steel mechanical housing with a large exposed bronze ring surrounding a dark turquoise core, torn thick off-white steel casing at upper left and a second short broken dark steel beam at bottom right. Steel blue and silver metal with brass recovery fittings and one restrained turquoise core. Tangible heavy broken machine part, NOT a futuristic gun, not an abstract polygon, no active glow, no writing or runes, no loose tiny screws, no background. Strong jagged material silhouette, very few broad masses.

Source: `exec-6ae5b682-23dd-4b71-a3bc-dbe2b7debf8e.png`.

### Neural resin (complete prompt)

> Use case: stylized-concept. Production game UI resource icon, single original asset for Border Empires, named Neural Resin. Subject: two chunky honey-amber resin nodules, a dominant irregular rounded triangular lump leaning right and a smaller supporting piece at its lower left. Recognizable natural solid resin, translucent amber body with a tiny dark branching biological inclusion inside the main piece. Art direction: premium hand-painted strategy resource icon with broad three-tone shading, bold nearly black brown silhouette outline, warm cream edge highlights, rich amber orange midtones, dark reddish amber lower shadows, bevelled organic volume. Designed like professional Civilization VI-era inventory illustration craft, original design not a recreation. Crucial: compact easily identified silhouette readable at 16 and 24 pixels, only 2 main objects, no fine texture, no small decorative detail. Fill 88% of square width and height with the cutout; 6% transparent safe padding, centered square composition. Consistent top-left light, three-quarter view. No text, no letters, no border, no hexagon or badge, no background surface, no cast shadow outside object. True transparent alpha background.

Source: `exec-e56804bc-79d5-4f25-b3e0-9431af960b74.png`.
