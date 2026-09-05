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
  },
  {
    createdAt: 1788207240438, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.4",
    title: "Fixed the 3D border overlay disappearing on islands the camera isn't near",
    why: "The true-3D renderer only keeps map chunks loaded near the camera's current position, so a player-owned island elsewhere on the map has no locally-cached tile data even after it's been discovered. The border-overlay renderer treated a missing local tile the same as a genuinely fogged one, so the Aether Survey Line boundary silently vanished on every island except whichever one the camera happened to be near.",
    changes: [
      "The 3D map's border overlay (Aether Survey Line) now stays visible on previously-discovered islands even when their chunks aren't currently streamed in near the camera"
    ]
  },
  {
    createdAt: 1788283561968, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.1",
    title: "AI empires now go on a war footing under sustained attack",
    why: "AI empires only reacted to enemy or barbarian pressure by nudging a few scores -- never enough to actually stop building granaries and grabbing scattered land while a real, ongoing incursion was underway. Confirmed live: an AI empire lost dozens of tiles a day to barbarian raids while its planner kept treating every tick as business as usual.",
    changes: [
      "AI empires now recognize a sustained, land-connected threat and shift into a focused war footing -- expansion redirects toward retaking ground instead of scattering outward, non-essential building is put on hold, and attacking/fortifying get a real priority boost",
      "An ocean-separated threat (nothing reachable without crossing water) doesn't trigger this -- it still raises alarm normally, just doesn't put the whole empire on a war footing",
      "The war footing holds for a few ticks after the threat clears before easing off, so it doesn't flicker on and off with every single tile that changes hands"
    ]
  },
  {
    createdAt: 1788295630309, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "3D map shadows: lighter, visible through owned/settled tile color, and extended to more buildings",
    why: "The first shadow pass left three visible problems. The shadow itself defaulted to fully dark (three.js's shadow.intensity = 1), reading harsher than intended. The owned/settled tile color overlay used a straight alpha blend, which puts 85%/50% weight on its own flat color and only 15%/50% on the ground's real (possibly shadowed) color underneath -- so a tile's real cast shadow barely showed through the ownership tint at all. And mountains, town buildings, forts, watchtowers, and docks build their own meshes outside the shared structure-piece factory the first pass wired up, so they were skipped and kept reading as flatly lit no matter the sun's angle -- worsened by the shadow map's texel density being too coarse at typical zoom for fine building/tree detail, which read as pervasive self-shadowing acne rather than clean lighting.",
    changes: [
      "The 3D map's cast shadows are noticeably softer than before",
      "A tile's real cast shadow now visibly darkens its owned/settled color fill instead of being hidden underneath it",
      "Mountains, town buildings, forts, watchtowers, and docks now cast and receive real shadows too, matching trees and most other structures",
      "Raised the shadow map's resolution and retuned its bias to cut down on shadow-acne flicker on building/tree surfaces, which was making them look unlit even with shadows enabled"
    ]
  }
];
