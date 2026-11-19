import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FOOD_SHORTAGE_GUIDANCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Short on FOOD: the tracker shows the fixes",
  why: "With more FOOD used than produced, builds said only \"Need a free FOOD slot\", and nothing said how far short you were or what to do.",
  changes: [
    "A build blocked on slots now says how far short you are, e.g. \"Need a free FOOD slot · 5 short\". The same goes for Titanium, Crystal and Umbrite",
    "When FOOD runs short, Next step shows \"Short 5 FOOD\". Tap it for the fixes, cheapest first: garrison grain or fish you hold, expand toward grain or fish nearby, send your scout drone when none is known, or build Farm Plots",
    "\"Build Farm Plots\" queues as many as your closest town has free plots for and centres the map there. Plots past your Dev slots wait in the queue"
  ]
};
