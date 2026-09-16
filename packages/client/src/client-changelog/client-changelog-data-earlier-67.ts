// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_67: ClientChangelogEntry[] = [
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
  }
];
