import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SALVAGE_TRIBUTE_BALANCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Smaller salvage deliveries, and AI Houses now ship salvage too",
  why: "Shipping salvage to the Court gave far too much manpower for a 60-manpower Reclamation Works, and AI Houses built Works but never shipped a single load.",
  changes: [
    "Each load of precursor salvage shipped to the Court now brings an Imperial delivery worth 15% of your manpower cap (was 25%).",
    "AI Houses ship a load from their Reclamation Works when their manpower drops below 35% of the cap."
  ]
};
