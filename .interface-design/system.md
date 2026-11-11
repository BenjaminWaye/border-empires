# Command navigation and attention

Imperial command interface: dark ink, fine brass edges, flat amber glyphs.
Keep the map and current decision prominent; routine navigation stays quiet.

- Glyphs: `packages/client/public/icons/nav/`, 24px grid, 1.6px amber strokes,
  square ends. No gradients or painted highlights. Selected glyphs darken.
- Desktop: a 68×66px button with rounded corners and an opaque ink surface
  behind both the icon and the persistent 12px sans-serif label.
- Default surfaces are ink; open destination is amber, with `aria-pressed`.
  Keyboard focus remains visible. Hover gets a border and subtle fill change.
- Compact navigation fits the same icon and label treatment into a row of
  tabs that make room for longer names, with type that scales to the available width.
  An opaque ink strip backs the full row.
- Chronicle history counts use neutral badges; actionable requests retain red.
- Manpower is a 144px gauge with its original full-opacity empire-colour fill.
  Overflow keeps the globe silhouette intact. Contained rolling highlights and
  internal bubbles show agitation; two small droplets escape around the upper
  sides. Bubble count scales with surplus, capped at six. Reduced motion keeps
  static highlights and bubbles. At capacity and above, fill the glass to its
  entire edge with no air gap. No protruding liquid shape or additional meter. No surplus badge
  or decorative dotted ring. Exact values stay in the tooltip and accessible name.
- Continue fighting collapses recovery to a small edge launcher. Show the total
  requirement in red when unaffordable. Keep recovery reachable without blocking combat.
- Profile shows the initial centered on a solid button in the player’s empire color.
  It has an accessible name and an inset amber outline when selected.
  Closing your own profile returns to the map.
  Rival profiles opened from another screen retain their contextual return.
- Minimap canvas and coordinate readout share the flat ink surfaces, brass
  edges and mono typography of the command panels.
- Keep ceremonial type for identity and headings; practical labels use sans-serif.
