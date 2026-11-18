import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOGIN_LORE_QUOTES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Lore quotes while you load in",
  why: "The few seconds spent loading into a Sector were blank time. They now show a glimpse of the world you're fighting over.",
  changes: [
    "The loading card shows a short quote from the Writ of Sectors, Duke Alvra Sable's memoir or the frontier",
    "The quote steps aside when loading runs into trouble, so retry and reload stay easy to spot"
  ]
};
