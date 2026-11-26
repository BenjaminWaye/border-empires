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
    "All towns applies a focus to every town after a second tap",
    "On a keyboard, 1–4 pick a focus and ← → step between your towns",
    "The town's manpower line now reads per refill, and includes its focus"
  ]
};

export const TOWN_FOCUS_LIST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Town focus switches at once, and the Towns list can set it",
  why: "Waiting up to four hours for a focus to start made tweaking feel dead, and changing focus meant opening each town.",
  changes: [
    "A new focus takes effect within a minute instead of at your next refill, so the town's figures update as you tweak",
    "Switching back and forth gains nothing: each focus pays only for the time it is in force, and manpower still arrives at each refill",
    "The Towns list has a Focus column with Balanced, Growth, Levy and Commerce beside every town, and a MP per refill column",
    "Set every town sits above the table, shows your current mix, and needs a second tap",
    "Growth dims on a town whose growth is paused by war or hunger, since that focus would only cost Coin and MP there"
  ]
};
