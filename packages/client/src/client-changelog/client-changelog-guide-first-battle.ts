import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_FIRST_BATTLE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Guide: your first battle",
  why: "New players ran out of things to do a few minutes in: scout charges spent, no Coin, and no one to fight, although an Insurgent camp sits a short way from every landing.",
  changes: [
    "The guide now ends with a First battle chapter: it marks the nearest Insurgent camp and your scout drone flies there for free, even with no charges left.",
    "It then walks you through raising a muster flag, reading your win chance, attacking the camp and taking it.",
    "The camp comes into sight when the drone reaches it and stays in sight until it falls or you move past the chapter. Other Explore flights no longer reveal a camp.",
    "A new Diplomacy step shows the alliance option: with a House twice your size it reads Swear fealty."
  ]
};
