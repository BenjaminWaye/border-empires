import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SIEGE_ODDS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Besieged towns defend worse",
  why: "Cutting a rival town off to 0 coin a day left its capture odds unchanged, so encircling it felt pointless.",
  changes: [
    "A town with none of its surrounding plots garrisoned by its owner, and a rival on one of them, is Besieged: its defense drops by 25%",
    "Capture odds on the town and in the attack and march confirms say \"Besieged\""
  ]
};
