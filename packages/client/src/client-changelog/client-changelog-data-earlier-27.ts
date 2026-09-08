// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_27: ClientChangelogEntry[] = [
  {
    createdAt: 1788433124761, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.2",
    title: "Fixed muster flags surviving on tiles auto-claimed from a previous owner",
    why: "A tile that lost its owner without going through a normal capture (e.g. cut off by encirclement, or decayed and then re-entering someone's reach border) could still be carrying a stale muster flag -- and its pooled manpower -- staged by whoever held it before. The instant-claim-on-reach path that grants such neutral tiles to the new owner for free copied that leftover flag straight over instead of clearing it, so a captured/claimed tile could visibly show an enemy's muster marker on ground you now owned.",
    changes: [
      "Auto-claiming a neutral tile via reach now always strips any leftover muster flag from a previous owner, matching every other ownership-changing path (attack/expand capture, encirclement cutoff, out-of-reach decay)"
    ]
  },
  {
    createdAt: 1788432985707, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Fixed occasional camera stutter while panning the 3D map",
    why: "The true-3D renderer rebuilds its visible terrain window whenever tilesRevision changes, but that counter bumps on any visually-relevant tile change anywhere on the whole known map -- not just tiles near your camera. An opponent building on the far side of the world, or a distant frontier decay tick, was forcing a full rebuild of your entire visible terrain (mesh, roads, ~25 overlays) even though nothing on screen changed, and could collide with a pan-triggered rebuild to cause a visible stutter.",
    changes: [
      "The 3D renderer's terrain rebuild now only fires for a tile change when the changed tile actually falls inside your current camera view, instead of any tile change anywhere on the map"
    ]
  },
  {
    createdAt: 1788430951671, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.2",
    title: "Fixed the 3D border line briefly following the camera during a pan",
    why: "The 3D border/reach overlay's pylons and connecting lines are placed relative to a fixed terrain anchor that only jumps when the terrain streamed around the camera actually rebuilds, and their own placement recompute is throttled separately (for idle-camera performance) from that terrain rebuild. A rebuild landing inside that placement throttle's cooldown window left the border rendering at its stale, pre-rebuild position for a moment after the terrain and camera had already moved on -- reading as the border briefly detaching and drifting with the pan before snapping back into place.",
    changes: [
      "The 3D border line (Aether Survey Line) and its glow no longer visibly detach and follow the camera for a moment mid-pan before snapping back -- it now re-anchors in the same frame as every terrain rebuild"
    ]
  },
  {
    createdAt: 1788420347209, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "You can now hold a truce with more than one empire at a time",
    why: "Truces and truce offers were capped globally: accepting or offering a truce with anyone blocked you from having any other active truce or pending outgoing offer, even with a completely different empire. Alliances were never capped this way -- you could always ally with multiple players at once -- so the truce restriction was an inconsistent, unannounced limit rather than an intentional design constraint. Truces are now tracked per pair of players, matching how alliances already worked.",
    changes: [
      "Truces (and pending outgoing truce offers) are no longer limited to one at a time -- you can hold an independent truce, or have a pending offer, with each opponent separately",
      "Offering, accepting, or having an active truce with one empire no longer blocks truce actions toward any other empire"
    ]
  },
  {
    createdAt: 1788463537342, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "Space View follow-ups: one launcher button, real Influence/Production, and a fixed Manage Planet action",
    why: "Early feedback on the first Space View pass found the chrome carried over more of the season HUD than belonged there, and a real bug: Manage Planet appeared to do nothing because the overlay it opens lives inside #hud, which Space View hides via CSS visibility -- and visibility is inherited, so the overlay stayed invisible even once it was no longer [hidden] itself.",
    changes: [
      "Manage Planet now actually opens the planet/christening overlay -- it was rendering correctly all along, just invisible, since #hud's visibility:hidden (used to hide the season HUD behind Space View) was silently inherited by the overlay nested inside it",
      "The Space View launcher is now the single button in both directions: it opens Space View from the season HUD and doubles as the return-to-season action once inside, so there's no separate \"Return to Season\" button anymore",
      "That launcher now sits above the minimap (matching where the old galaxy overlay's launcher used to sit) instead of overlapping its top edge",
      "The top bar now shows the account's real Influence and Production balance (when the gateway's galactic economy is wired up; 0/0 otherwise) instead of the season's Food/Titanium/Crystal/Umbrite/Shard ribbon, which has no meaning at the galactic layer"
    ]
  }
];
