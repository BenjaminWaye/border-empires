import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SIEGE_CUT_OFF_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Besieged means cut off completely",
  why: "A newly settled town counted as Besieged the moment anyone attacked it from one neighbouring plot.",
  changes: [
    "A town is Besieged only when its owner holds none of its 8 surrounding plots, settled or frontier, and a non-allied rival holds one",
    "The March To confirm line's \"Besieged\" tag now matches the odds it shows"
  ]
};
