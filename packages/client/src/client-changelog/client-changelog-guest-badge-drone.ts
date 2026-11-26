import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUEST_BADGE_DRONE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Drone timer no longer sits on the Save your empire button",
  why: "While the scout drone was out, its flight timer covered the guest Save your empire button.",
  changes: ["The Save your empire button steps aside while the scout drone's planner, flight timer or report is up, and comes back after."]
};
