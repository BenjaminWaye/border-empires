import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const UNLOCK_CELEBRATION_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Achievements and House Charges now get a celebration card",
  why: "Earning an achievement or completing a House Charge happened silently. You only noticed a badge on your profile or a counter going from 0/2 to 1/2.",
  changes: [
    "A new achievement or a newly held House Charge opens a card in the middle of the screen with its badge, name and reward",
    "Tap anywhere or Nice to close it; it also closes on its own after a few seconds. Several unlocks show one after another",
    "Badges you already had when you opened the game, and cards you have already seen, are not shown again",
    "Your profile now shows when each kept charge was held or lost, matching its card"
  ]
};
