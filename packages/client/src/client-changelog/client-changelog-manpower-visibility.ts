import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MANPOWER_VISIBILITY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "See where your manpower goes",
  why: "Muster flags refilling from your pool could drain hundreds of manpower in minutes with nothing showing it, flag rows in the Manpower panel ignored taps, and coin earned while away arrived with no explanation.",
  changes: [
    "The manpower orb shows \"−N/min → flags\" while flags refill, and an amber rim arc for manpower held in flags.",
    "The Manpower panel lists what each flag drew in the last 10 minutes and the amount it fills to.",
    "Flag rows in the Manpower panel respond to taps again.",
    "\"Since you last looked\" says what came in while you were away: coin, manpower refills and manpower sent to flags, and when coin stopped after 24h away.",
    "The attack sheet says how long the attack's muster flag takes to fill, and that it can be attacked meanwhile."
  ]
};
