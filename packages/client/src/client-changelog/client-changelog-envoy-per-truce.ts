import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ENVOY_PER_TRUCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Envoy Accreditation pays for every truce",
  why: "A single 10% bonus gave no reason to hold more than one truce.",
  changes: [
    "Envoy Accreditation now adds 20% Coin for each House you have a truce or mutual alliance with",
    "There is no limit on how many Houses count"
  ]
};
