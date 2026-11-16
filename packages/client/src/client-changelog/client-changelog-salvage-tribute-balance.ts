import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SALVAGE_TRIBUTE_BALANCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Salvage deliveries are a flat 500 manpower, and AI Houses now ship salvage too",
  why: "Shipping salvage to the Court paid a share of the manpower cap, so larger empires earned more per load, and AI Houses built Works but never shipped a single load.",
  changes: [
    "Each load of precursor salvage shipped to the Court now brings a flat 500 manpower, never above your cap (was 25% of your manpower cap), so every empire gets the same per load.",
    "AI Houses ship a load from their Reclamation Works when their manpower drops below 35% of the cap."
  ]
};
