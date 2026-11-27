import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUEST_BADGE_DRONE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Drone timer no longer sits on the Save your empire button",
  why: "While the scout drone was out, its flight timer covered the guest Save your empire button.",
  changes: [
    "The Save your empire button hides while you plan a scout flight, while the drone flies and while its report is up, and comes back after.",
    "On a computer, while the drone is ready to launch, the button now sits just above the drone button instead of covering it."
  ]
};
