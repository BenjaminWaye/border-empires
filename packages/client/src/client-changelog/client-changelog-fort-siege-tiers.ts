import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FORT_SIEGE_TIER_PICKER_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Choose your fort and siege tier",
  why: "Builds always went straight to the strongest tier your research allowed, and a tier you couldn't build simply vanished from the menu.",
  changes: [
    "Fortify and Siege now open a picker listing every tier with its cost, slots and defense or attack.",
    "Pick a cheaper tier when you'd rather save manpower and slots — a plain Fort instead of a Titanium Bastion, or a Siege Battery instead of a Dread Tower.",
    "Locked tiers stay in the list and say why: the research you need, a module that isn't installed on your AFC, or a missing resource slot.",
    "Upgrades can skip a tier, paying the chosen tier's price."
  ]
};

