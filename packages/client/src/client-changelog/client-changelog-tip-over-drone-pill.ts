import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TIP_OVER_DRONE_PILL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Tips no longer hidden under the drone timer on phones",
  why: "While the scout drone was flying, its timer covered the Center and Got it buttons on tips such as First Contact.",
  changes: ["On phones, a tip now sits just above the scout drone's flight timer while the drone is out."]
};
