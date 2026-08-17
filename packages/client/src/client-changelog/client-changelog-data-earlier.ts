// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [
  {
    createdAt: 1786530000000, // 2026.08.12.3
    introducedIn: "2026.08.12.3",
    title: "Muster ADVANCE flags launch one attack at a time",
    why: "A flag set to ADVANCE re-searched on every automation tick, so it could fire a second attack while its first was still resolving — and an underfunded flag kept re-sending a doomed strike every tick. A flag now waits for its in-flight attack to resolve before launching another, and only fires when it can actually afford the target.",
    changes: [
      "Muster flags in ADVANCE mode now wait for their current attack to resolve before launching another.",
      "A flag that can't afford an attack no longer sends the strike to the server at all."
    ]
  },
  {
    createdAt: 1786547200000, // 2026.08.12.11
    introducedIn: "2026.08.12.11",
    title: "New 3D dock overlay and matching 2D icon: a working cargo-crane pier",
    why: "Docks used a placeholder timber-deck look with a mast and flag that read as a boatyard — none of it said 'this tile is how goods move across the ocean'. Replaced it with an actual working port scene: the dock is now a heavy timber-and-iron pier with a large brass cargo crane actively hoisting a crate over the loading deck, backed by a steam winch, boiler and pipe run, a compact dockhouse with amber-lit windows, mooring posts chaining a small steampunk cargo barge alongside, and crates, barrels and lamps that make the pier feel busy and lived-in.",
    changes: [
      "Docks now render a dedicated 3D cargo port: timber-and-iron pier, tall brass rotating cargo crane with a visibly suspended crate, steam winch and boiler, compact dockhouse, moored steampunk cargo barge, mooring chains, and small amber lamps.",
      "The 2D dock icon (used where the 3D renderer is off) matches the new look: same crane, pier, cargo and barge, with strong dark outlines so it still reads at a glance.",
      "Docks are unchanged mechanically — this is purely the on-map look."
    ]
  },
  {
    createdAt: 1786449600000, // 2026-08-11
    introducedIn: "next",
    title: "2D map now has SVG overlays for every structure and natural wonder that renders in 3D",
    why: "The 3D map gained several structures and all nine natural wonders that the classic 2D map couldn't draw — those tiles showed only a placeholder box, or nothing at all, so the two maps disagreed about the same world.",
    changes: [
      "New 2D SVG overlays for Seed Granary, Census Hall, Weapons Workshop, Titanium Weapons Factory, Umbrite Weapons Factory, and every World Engine and Imperial Exchange monument part.",
      "Natural wonders (Foundry Heart, Deepwater Engine, Conscription Engine, Warpress, Bastion Frame, Calculating Engine, Quickforge, Watchtower Engine, Cartographer's Lens) now render on the 2D map instead of being invisible.",
      "Each overlay matches its 3D counterpart's silhouette so the classic map and the 3D map show the same buildings."
    ]
  },
  {
    createdAt: 1786463900000, // 2026.08.11.6 — frozen from a live Date.now() call
    introducedIn: "population-bureau-part-models",
    title: "Population Bureau components now render as distinct 3D models with their own map icons",
    why: "The Population Bureau's 3 unique components — the Census Engine, Registry Vault, and Levy Charter — previously had no dedicated art, so on the map they fell back to a generic placeholder instead of reading as a monument under construction.",
    changes: [
      "3D map: each of the Population Bureau's 3 components now renders its own dedicated model — the Census Engine (a compact horizontal brass drum in a dark iron frame with fanned parchment record cards, one separated card carrying a muted green processing glow), the Registry Vault (a squat dark-iron strongbox with reinforced brass corners, heavy hinges, a thick brass lid tilted ajar, and a restrained warm amber glow in the gap), and the Levy Charter (an upright rolled imperial decree with thick brass caps and a small unrolled section bearing a subtle gold sigil).",
      "2D map: each component now has its own flat overlay icon matching the monument set's muted iron/brass/parchment look with a single restrained emissive accent.",
      "The 2D fallback overlay for component tiles is no longer drawn in 3D mode, matching other structures."
    ]
  },
  {
    createdAt: 1786453200000, // 2026-08-11
    introducedIn: "fix/dock-attack-require-foothold",
    title: "Attacking across a dock now requires capturing the dock first",
    why: "AI empires could attack land tiles merely adjacent to an enemy-linked dock without ever capturing that dock, letting them raid an island human players can only reach by first taking the dock as a foothold.",
    changes: [
      "A dock-crossing ATTACK must now land on the linked dock tile itself, for both players and AI — matching how dock-crossing EXPAND already worked.",
      "Fixes AI empires bypassing the foothold requirement that human players were always held to."
    ]
  },
  {
    createdAt: 1786454100000, // 2026-08-11
    introducedIn: "fix/dock-attack-require-foothold",
    title: "Mustering flags now fire across a linked dock",
    why: "A muster flag's auto-fire (ADVANCE mode) search only walked ordinary grid neighbors, so a flag placed on a dock could never \"see\" the enemy dock linked across the water — the flag just sat there, staged and never firing, even though a manual attack from the same tile worked fine.",
    changes: [
      "Muster flags in ADVANCE mode can now find and fire on an enemy tile across a dock link, the same way manual ATTACK commands already could."
    ]
  }
];
