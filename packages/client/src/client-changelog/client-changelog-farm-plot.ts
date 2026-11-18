import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FARM_PLOT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Farm Plots: grow food at home with manpower",
  why: "A House with a town but no grain or fish nearby had no food slots for its first buildings, and spare manpower had nothing to build.",
  changes: [
    "Build a Farm Plot on a plain tile beside your town: 150 manpower, no Manifest, +1 food slot",
    "With Hyperfeed Seedstock, upgrade a Farm Plot to a Hydrogarden Plot for 80 manpower: 3 food slots, more near Hydroworks",
    "The Economy panel lists Farm Plots among your food sources"
  ]
};
