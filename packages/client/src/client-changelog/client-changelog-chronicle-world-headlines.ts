import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHRONICLE_WORLD_HEADLINES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Chronicle's world headlines say who is winning, not just what was spent",
  why: "World headlines quoted manpower spent without the result, so a rout read like a heroic defence (\"just 405 tiles lost\"), and the same war often showed up twice.",
  changes: [
    "A heavily attacked empire that lost real ground now shows as \"Under Siege\", with the share of its realm it lost. \"Held the Line\" appears only when the defence actually held",
    "Fiercest Attacker now says how many tiles the spending won, and Bloodiest Battle says whether the assault broke through or was thrown back",
    "When the day's heaviest defeat happened inside the day's biggest war, the two are now one headline instead of two",
    "Large numbers are grouped (18,730), and headlines about territory now rank above manpower totals"
  ]
};
