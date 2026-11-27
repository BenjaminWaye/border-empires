import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DRONE_EXPLORE_R3_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Scout drone rules shown on the map",
  why: "Drone plans said a bare Blocked, stops jumped without a reason, the range limit was hidden, and a few taps and map links went to the wrong place.",
  changes: [
    "The plan names the border in the way, and says when a stop was moved to the range limit or short of a border",
    "A dotted ring shows how far the next stop can go, on both map styles",
    "Reopening Explore after Cancel no longer shows the old stop",
    "Closing the drone report no longer starts a new plan",
    "Report links skip your own land and go to the place found",
    "The report says Turned back and names the border",
    "Relic labels let taps through to the tile under them",
    "The relic card's Garrison to activate is plain text, not a button",
    "The overview map draws your allies' land in their colour",
    "Charge areas mark your own unsettled land and land you don't hold differently"
  ]
};
