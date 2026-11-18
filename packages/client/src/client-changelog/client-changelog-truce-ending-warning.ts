import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TRUCE_ENDING_WARNING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Truces warn before they end",
  why: "Truces ran out without warning, and the Chronicle showed only a time of day, so an extended truce's end looked the same as the original.",
  changes: [
    "In a truce's last 2 hours, Diplomacy pins it under \"Truces ending\" with the time left and an Extend button; its card and deal screen show the time left in red.",
    "You get one Activity notice and popup when a truce enters its last 2 hours, and again if it is extended and runs low again.",
    "Chronicle truce rows now show when the truce ends (\"ends tomorrow 00:45\"), including the new end after an extension, and rows from another day name the day (\"yesterday 00:45\", \"Sun 00:45\")."
  ]
};
