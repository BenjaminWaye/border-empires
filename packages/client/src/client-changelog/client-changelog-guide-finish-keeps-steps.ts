import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_FINISH_KEEPS_STEPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Finishing the guide no longer skips Contest and Diplomacy",
  why: "Pressing Finish at 13/16 ended the guide, so the Contest and Diplomacy steps were gone. The last step also read like a chore to do before you could press Finish.",
  changes: [
    "Finish now folds the guide to its corner button. It opens again by itself when you first meet a rival House or Planetary Defense, so you can do Contest and Diplomacy",
    "The last step says which steps come back on first contact, and its title is just \"That's the basics.\" How much manpower you have to spend is in the line below it"
  ]
};
