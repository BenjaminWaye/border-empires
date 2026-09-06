// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_13: ClientChangelogEntry[] = [
  {
    createdAt: 1788211204796, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.5",
    title: "Fixed the 3D map's sea lighting and wave animation restarting when you click a tile",
    why: "Clicking a tile refreshes its detail from the server, and that refresh arrives back as a TILE_DELTA even when nothing about the tile actually changed. The client bumped its tile-revision counter on every TILE_DELTA unconditionally, and that counter is the only signal the true-3D renderer's rebuild loop watches -- so a no-op detail refresh forced a full terrain + water-surface rebuild anyway, visibly restarting the sea's wave and lighting animation once for the click and again a moment later when the server's reply landed.",
    changes: [
      "Clicking a tile no longer restarts the 3D map's sea wave/lighting animation when the server's tile-detail refresh comes back unchanged"
    ]
  },
  {
    createdAt: 1788210175810, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.5",
    title: "Fixed a muster flag's auto-fired attacks missing their skirmish animation and briefly flipping the tile back to the defender",
    why: "A muster flag's ADVANCE-mode attack is dispatched by the server, not submitted by this client, so it never occupied the single slot the skirmish animation and combat-outcome prediction were built around -- the pre-resolution clash never rendered (only the final capture flourish did), and an unrelated leftover prediction from an earlier fight could get stamped onto the wrong tile, flipping it to the defender for a moment before the next correction reasserted the real outcome.",
    changes: [
      "A muster flag's auto-fired ADVANCE attack now plays the same pre-resolution skirmish animation a manually-dispatched attack does",
      "A resolved attack no longer applies a stale, unrelated prediction to the wrong tile -- fixing the brief attacker-to-defender-and-back ownership flicker on muster-fired captures"
    ]
  },
  {
    createdAt: 1788274542099, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.1",
    title: "Fixed the 3D map's selected dock's sea-route line drifting as you panned the camera",
    why: "The true-3D dock route overlay only recomputes its segment positions when the selected tile or dock list changes, but it was anchoring those positions to the live, continuously-panning camera position instead of the terrain's stable rebuild anchor that every other 3D overlay uses -- so once a dock was selected, its dashed sea-route line stayed glued to wherever the camera happened to be at that moment and visibly slid away from the actual route as you panned, instead of tracking the terrain underneath it.",
    changes: [
      "A selected dock's sea-route line on the 3D map now stays fixed to the terrain while you pan the camera, instead of drifting with it"
    ]
  },
  {
    createdAt: 1788276180062, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.2",
    title: "Trees and most structures now cast real shadows on the 3D map",
    why: "The 3D renderer never turned on WebGL shadow mapping, so nothing in the scene ever cast or received a real shadow no matter how a mesh's own castShadow/receiveShadow flags were set -- trees especially read as flatly lit and \"pasted on\" the ground instead of grounded, most noticeably under the raking sun angle from a recent lighting pass.",
    changes: [
      "Trees and most structures (economic, late-game, civic, infrastructure, industrial, manpower, worldbreaker, imperial exchange, astral dock, and population bureau buildings) now cast a real shadow onto the ground and onto each other on the 3D map, instead of only the flat contact-shadow decal underneath them",
      "Town buildings, forts, watchtowers, mountains, resource deposits, and docks don't cast real shadows yet -- they still only show the flat contact-shadow decal"
    ]
  },
  {
    createdAt: 1788275769776, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.3",
    title: "AI empires now keep a manpower reserve so they can actually fight back",
    why: "AI empires spent every point of manpower regen on expanding the moment it became affordable (unlocked at just 10 manpower), while attacking required 60 -- so an AI's manpower could mathematically never climb high enough to launch an attack. Confirmed live: several AI empires lost dozens of tiles a day to barbarian raids while sitting completely idle, unable to ever fight back.",
    changes: [
      "AI empires now hold back a manpower reserve for attacking instead of spending every point on expansion and building, so they can actually respond to sustained threats"
    ]
  }
];
