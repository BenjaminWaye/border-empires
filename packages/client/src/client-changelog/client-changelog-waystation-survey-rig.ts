import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAYSTATION_SURVEY_RIG_ENTRY: ClientChangelogEntry = {
  createdAt: 1795013008269,
  introducedIn: "2026.11.18",
  title: "Survey Rigs with rewards to collect",
  why: "Waystations should look like a prize on the map and let you choose when to collect it.",
  changes: [
    "Waystations now look like portable Survey Rigs, with a brass tripod, cyan lens, canvas shelter and supply case in both map renderers.",
    "A hovering prompt stays above each visible, uncollected rig. Claim its tile, then press Activate to collect one random reward.",
    "The rig and prompt disappear after collection. The reward pool is unchanged."
  ]
};
