import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LAUNCH_ATTACK_FLAG_SPOT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Launch Attack: place your flag and pick effort in one tidy sheet",
  why: "With no flag nearby, Launch Attack quietly raised one on the border tile next to the target, where one enemy capture hands them the manpower on it.",
  changes: [
    "With no flag near, pick its distance from the enemy: Safe (3+ tiles), Close (2) or Border (1), each with a risk dot; hover for the march time",
    "Effort (Normal, Extra, Double) sits in the same sheet with its manpower cost; one line shows your win chance and the total",
    "Attack and march sheets now use the new HUD look, with far less text",
    "With a flag already near, no flag is raised and the sheet only asks for effort"
  ]
};
