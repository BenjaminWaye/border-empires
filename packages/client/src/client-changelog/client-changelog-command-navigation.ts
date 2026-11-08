import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COMMAND_NAVIGATION_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.08.1",
  title: "Clearer command navigation and manpower feedback",
  why: "Navigation needs readable destinations, and the map should stay usable while your AFC is offline.",
  changes: [
    "Navigation uses flat amber glyphs with persistent names. Your Profile closes directly to the map.",
    "A full manpower orb fills to its rim; excess manpower adds rolling liquid and bubbles without changing your empire colour.",
    "Continue fighting folds AFC recovery into a small edge button. Unaffordable replacement costs are red, and the minimap matches the HUD."
  ]
};
