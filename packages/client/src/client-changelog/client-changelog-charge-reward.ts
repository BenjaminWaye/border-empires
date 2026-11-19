import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHARGE_REWARD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Collect your House Charges when a Sector Contest ends",
  why: "Holding a charge to the end was a big effort, but the reward was a line in a tab and a number you could not see.",
  changes: [
    "When a Sector Contest's winner is crowned and you held charges, your sealed cards appear over the season-end screen. Tap Collect to turn them over one by one.",
    "Each card now banks Domain score for your House by rarity: Common +1, Rare +2, Mythic +4. You see your Domain score count up as each card lands.",
    "Every House banks Domain score, whether or not it holds a Planet or Outpost. It counts in the race for Emperor and in Senate votes. Held charges no longer add Influence to a Stipend."
  ]
};
