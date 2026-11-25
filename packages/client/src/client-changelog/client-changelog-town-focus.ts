import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_FOCUS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Town focus: tune each town while you wait for manpower",
  why: "Once your manpower ran out there was little left to adjust. Each town can now be pointed at growth, manpower or Coin, for free.",
  changes: [
    "Select one of your towns: its menu has Balanced, Growth, Levy and Commerce focus",
    "Each focus gives +20% to its output and −10% to the other two; Balanced keeps today's numbers",
    "A change is free and starts at your next manpower refill; extra manpower from Levy is paid at the refill after that",
    "A captured or returned town goes back to Balanced"
  ]
};
