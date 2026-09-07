// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_20: ClientChangelogEntry[] = [
  {
    createdAt: 1788297789549, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.1",
    title: "Space View: a navigable 3D galaxy screen for planet-owning empires",
    why: "The galactic meta-layer's persistent planet records existed with no way to actually look at the galaxy -- only a flat placeholder overlay. Players who've won a durable galaxy Planet now get a real, full-screen 3D scene to see their holdings and the wider galaxy in, laying the groundwork for the galactic layer's future systems.",
    changes: [
      "New Space View screen (a 🌌 launcher button, shown only to accounts owning at least one galaxy Planet) with a real 3D starfield/nebula backdrop, orbit-controllable camera, and planets rendered as glowing shader-lit spheres",
      "Planets are visually distinguished by state: your own worlds glow bright, other-owned worlds render dim/neutral, unclaimed frontier worlds are near-invisible markers, and contested worlds pulse a warning ring -- though no backend signal for contestation exists yet, so that state is currently unreachable in practice",
      "Click a planet to signal re-entering its Sector campaign (season) -- dragging to orbit the camera no longer misfires this, only a genuine stationary click of the primary button does; the callback seam itself is wired and typed, but doesn't yet switch seasons",
      "Space View is 3D-only for this first pass, with no 2D fallback -- unlike the existing tile map, it has no accessibility renderer yet",
      "Planet owners see one entry-point button, not two -- Space View absorbs the old galaxy overlay's launcher, which stays reachable from a new \"Manage Planet\" action inside Space View for christening your planet's name and endorsing an Emperor candidate. Outpost/Stipend-only accounts (no Planet, so no Space View) keep the old launcher as their only entry point",
      "An account's own Outpost, not just its Planet(s), now correctly highlights as owned in the scene rather than rendering as an unclaimed/rival world"
    ]
  }
];
