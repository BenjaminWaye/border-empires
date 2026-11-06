import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_AND_RECOVERY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793696822571, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "Guide: clearer first steps, a Manufactory, and diplomacy",
    why: "Playtesting the guide showed steps asking for the wrong action (Expand To on land you already held, Build on tiles you couldn't build on yet) and a last step that didn't say what to do.",
    changes: [
      "A town or food tile your reach already claimed: the guide says to Garrison it",
      "One you can see outside your reach: the guide says to Expand To it",
      "Nothing in sight: the guide marks a tile for a Relay Beacon",
      "The food steps show the grain and fish icons to look for on the map",
      "The guide asks you to tap your AFC rather than any tile, since tapping land next to your border claims it",
      "It recommends the Industrial Tooling Module as your first Manifest, then, once the module has docked at your AFC, asks for a Manufactory on your town",
      "A new Diplomacy step appears once you meet a rival House: open Diplomacy to offer a truce",
      "You can finish the guide even if you haven't met Planetary Defense or a rival yet; Finish closes it for good",
      "The last step now says plainly that manpower refills every 4 hours"
    ]
  },
  {
    createdAt: 1793744266797, // Date.now() captured once for this entry.
    introducedIn: "2026.11.03",
    title: "Fixed: your reach border could stop updating after a server update",
    why: "If your game stayed open while the server restarted, your client could ignore the new reach borders the server sent, so new Relay Beacons, towns and docks didn't move the border, often until you reloaded the page.",
    changes: [
      "Your reach border now updates again right after a reconnect, without reloading the page"
    ]
  },
  {
    createdAt: 1793776991902, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Guide: every first step says what to do",
    why: "With no town in sight, the guide's \"Find a town\" step gave no instruction, and the separate \"tap a tile\" step had no real goal.",
    changes: [
      "The \"Find a town\" and \"Find food\" steps are gone: the town and food steps now say Garrison, Expand To or build a Relay Beacon straight away",
      "With nothing in sight, the step tells you to tap the marked tile and build a Relay Beacon there",
      "The separate \"tap your AFC\" step is gone: the town step teaches tapping with a real goal"
    ]
  }
];
