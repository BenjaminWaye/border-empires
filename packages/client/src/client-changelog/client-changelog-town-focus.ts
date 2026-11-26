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

export const TOWN_FOCUS_PANEL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Town focus now lives in the town screen",
  why: "The four focus links in the tile bar told you nothing about what each choice would do to your town.",
  changes: [
    "Open a town: the Town focus card shows Balanced, Growth, Levy and Commerce with what each gives",
    "Point at a focus to see this town's Coin per day, manpower per refill and time to the next tier, against Balanced",
    "The card shows when your next refill is and which focus is queued for it",
    "All towns applies a focus to every town after a second tap"
  ]
};
