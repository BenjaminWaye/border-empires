import type { ClientChangelogEntry } from "./client-changelog-data.js";

// 2026.10.12 release entries, moved out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (AGENTS.md). The machinery and
// hydroponic-farm entries from that release live in
// client-changelog-structure-art-october.ts.
export const CLIENT_CHANGELOG_ENTRIES_OCT_12: ClientChangelogEntry[] = [
  {
    createdAt: 1791803592000, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.1",
    title: "Resource clues now show on the map",
    why: "Land near Titanium, Umbrite and Crystal carries a clue (ferrous dust, blackwood canopy, refractive ground), but the clues were lost on every server restart, never sent when you logged in, and drawn too faintly to see. Occupation-survey reports from conquered towns also vanished after a few dozen other events.",
    changes: [
      "Clue tiles now get a clear tint on both the 3D and 2D maps: rust for Titanium, violet for Umbrite, ice-cyan for Crystal",
      "Selecting a clue tile explains it in the tile overview, e.g. \"Ferrous dust: Titanium deposits are likely within a few tiles\"",
      "Garrisoning a neutral town now surveys the land around it: nearby clues become a report like \"Titanium likely north-east of this town\" (capturing an enemy town no longer does)",
      "Survey reports are no longer pushed out of your event log by later events"
    ]
  },
  {
    createdAt: 1791804620000, // frozen Date.now() value for this release
    introducedIn: "2026.10.12.2",
    title: "Manifest panel: clearer details, Good pick badge, clickable owned list",
    why: "The tech details were boxes inside boxes, listed the same unlocks three times, scrolled the whole panel so the name and Unlock button slid out of view, and never said whether a pick fit your empire. Your owned techs were a list you couldn't click.",
    changes: [
      "The Technology Tree is now the Manifest panel; each entry shows its type, e.g. \"AFC Module · War · Tier 1\"",
      "Details are one clean card: name and status stay at the top, the Unlock button (with its cost) stays at the bottom, and only the middle scrolls",
      "\"What you get\" lists every building, ability, revealed resource and bonus once, with a short description",
      "A Good pick badge appears when it fits your empire right now -- signs of its resource near your land, a survey from a neutral town you garrisoned, or a building you can start immediately; a note warns when everything it unlocks needs a resource you don't hold yet",
      "\"Leads to\" shows the next Manifests, what else each still needs, and how many more come after",
      "Your Manifests are grouped by branch as buttons; tap one to see what it gave you",
      "Rigging Works Module now lists the Umbrite Rig it unlocks"
    ]
  }
];
