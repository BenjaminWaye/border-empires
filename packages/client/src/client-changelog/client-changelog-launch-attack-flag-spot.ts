import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LAUNCH_ATTACK_FLAG_SPOT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Launch Attack asks where to put a new muster flag",
  why: "With no flag nearby, Launch Attack quietly raised one on the border tile next to the target, where one enemy capture destroys the manpower on it.",
  changes: [
    "When no flag is near, the attack sheet warns that flags can be captured and offers spots: Safe (3+ tiles from the enemy), Closer, or On the border, each with its march time",
    "The same sheet sets the effort level, so placing the flag and choosing Normal, Extra or Double is one step",
    "With a flag already near, nothing changes: the attack uses that flag and no new flag is raised"
  ]
};
