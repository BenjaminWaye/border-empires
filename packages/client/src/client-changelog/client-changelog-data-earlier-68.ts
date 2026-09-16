// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_68: ClientChangelogEntry[] = [
  {
    createdAt: 1789073087458, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.10",
    title: "Fixed the 3D map's selection-ring outline for a Great City/Metropolis town",
    why: "Selecting one of your own towns draws a highlighted outline around its support tiles on the true-3D map, distinct from the settle-tile hatch overlay. That outline was still hardcoded to the base 8-tile ring for every tier, so a Great City or Metropolis town's real second ring (its outer 16 tiles) never got the selection highlight even though those tiles do contribute to the town.",
    changes: [
      "A selected Great City or Metropolis town's 3D selection-ring outline now covers its full support ring (24 tiles), matching the settle-tile hatch overlay and every other support-ring consumer"
    ]
  },
  {
    createdAt: 1789050708101, // frozen, 1ms after the EXPAND claim-animation fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.9",
    title: "Fixed a muster flag's auto-fired EXPAND showing no marching-company approach on the 3D map",
    why: "The server always computes a muster flag's mechanical travel-time delay the same way for an auto-fired ATTACK and EXPAND alike, but the gateway only ever forwarded it on the message ATTACK gets -- EXPAND has no equivalent message, so its only broadcast silently dropped the delay. The client-side code waiting on it was already correct and untouched by this fix; it simply never received the fields it needed, so a MARCH flag fighting through neutral ground on its way to a target showed no marching approach at all, only the claim-sweep animation (fixed separately) starting immediately.",
    changes: [
      "A muster flag's auto-fired EXPAND now shows the marching-company approach on the 3D map for the whole time its company is still traveling to the tile, matching what an auto-fired ATTACK already showed"
    ]
  },
  {
    createdAt: 1789050708100, // frozen, 1ms after the monument-announcement entry -- keeps ordering stable
    introducedIn: "2026.09.10.8",
    title: "Fixed a muster flag's auto-fired EXPAND showing no claim animation on the 3D map",
    why: "A muster flag's ADVANCE/MARCH auto-fired EXPAND (claiming neutral ground the flag fights through on its way to a march target, or the nearest open land for ADVANCE) is dispatched by the server, not by this client, so it never occupied the single 3D claim-animation slot that only ever tracked this client's own manually-dispatched claim. The marching-company travel animation already played correctly on the way there (fixed separately); once the flag actually started claiming the tile, though, the tile-filling sweep animation simply never appeared.",
    changes: [
      "A muster flag's auto-fired EXPAND now shows the same empire-color claim-sweep animation on the 3D map that a manually-dispatched EXPAND already showed, for the whole time the tile is being claimed",
      "Any number of a player's muster flags claiming neutral ground at once now each get their own claim animation, instead of only ever being able to show one at a time"
    ]
  },
  {
    createdAt: 1789050708099, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.7",
    title: "Added an announcement when a rival starts building a monument",
    why: "Monuments (Imperial Exchange, World Engine, Aegis Dome, Astral Dock, Population Bureau, Titanium Levy) are a season-unique, winner-takes-all race, but nobody knew a race had even started until someone finished it. Everyone now hears about it the moment ground actually breaks.",
    changes: [
      "Every player now gets an Activity Feed entry the moment any player's monument construction begins -- specifically, when the first of its 3 parts starts building, not when the intent is queued or when it finishes"
    ]
  },
  {
    createdAt: 1789417055099, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.07",
    title: "Fixed a stability issue from the earlier barbarian-attack AI fix",
    why: "An earlier fix let AI empires retarget instantly (no cooldown at all) after an attack was rejected because the target changed hands. On a fast-moving barbarian frontier that meant some AI empires could resubmit rejected attacks every single game tick with nothing slowing them down, which piled up enough simultaneous work on the game server to stall it -- for a period, no one could log in.",
    changes: [
      "AI empires retargeting after a barbarian border flip now wait a brief moment (about a second) before attacking again, instead of instantly resubmitting -- still fast enough that it doesn't get stuck, but no longer able to overwhelm the server"
    ]
  },
  {
    createdAt: 1789417055098, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.06",
    title: "Toned down territory color in the 3D map",
    why: "Settled-territory tint sat at 0.85 opacity -- strong enough that a large empire's interior read as a solid color wash over the terrain, and left little visual gap between settled and frontier tint once frontier had earlier been raised to stay visible.",
    changes: [
      "Settled territory tint is now 0.6 opacity (down from 0.85) -- terrain and structures underneath stay visible through your own color",
      "Frontier tint is now 0.3 opacity (down from 0.5) -- keeps a clear, three-way gap between unowned, frontier, and settled tiles instead of frontier and settled nearly meeting in the middle",
      "3D map only -- the 2D canvas renderer's border strokes are a separate, already-more-restrained treatment and are unaffected"
    ]
  }
];
