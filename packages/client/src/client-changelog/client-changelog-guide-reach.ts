import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_REACH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "The guide's last step names the real loop",
  why: "The guide's send-off still listed \"expand\" as how you grow. Your reach is what grows.",
  changes: [
    "The last guide step now reads: explore for towns and resources, push your reach with beacons, garrison, build defences, improve your economy, attack."
  ]
};
