import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FAIR_DIPLOMACY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.19",
  title: "Fairer truces, earned alliances",
  why: "Small empires couldn't afford peace with neighbours they had never fought, alliances cost hundreds of coin, and a player could grab an AI's land and buy a truce to keep it.",
  changes: [
    "A truce with an empire you haven't fought in the last day costs the small peace price, even when your borders meet",
    "When you can't pay upfront, the AI's counter-offer and Suggest deal ask for coin per hour from your income instead",
    "Renewing peace no longer costs 50% more each time, unless you've been taking that empire's land",
    "Alliances are earned: once an AI is Pleased and you haven't fought for a day, it allies for free. Gifts still raise its opinion",
    "An AI that can still win back land you took won't sell you a truce to keep it"
  ]
};
