import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LAUNCH_ATTACK_FLAG_SPOT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Launch Attack: place your flag and pick effort in one tidy sheet",
  why: "With no flag nearby, Launch Attack quietly raised one on the border tile next to the target, where one enemy capture destroys the manpower on it.",
  changes: [
    "With no flag near, pick where it goes: Safe, Close or Border, each with a risk dot and its extra march time (hover for details)",
    "Effort (Normal, Extra, Double) sits in the same sheet with its manpower cost; one line shows your win chance and the total",
    "Attack and march sheets now use the new HUD look, with far less text",
    "With a flag already near, no flag is raised and the sheet only asks for effort"
  ]
};
