import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DIPLOMACY_OFFER_FLOW_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "See the offers you sent, hear when they're refused, and reach any empire from Diplomacy",
  why: "A phone playtest found offers you sent invisible, refusals silent, the first deal hard to find, and the offer dock's Confirm button looking like it did nothing.",
  changes: [
    "Diplomacy lists the truce and alliance offers you sent, with what you offered and a Withdraw button.",
    "A refused offer pops up with the answer, from a player as well as an AI. So does a truce offer that runs out unanswered.",
    "Diplomacy now also lists ranked empires you haven't met: you don't have to meet an empire to offer it a deal.",
    "The deal header reads \"135 tiles vs your 20\" instead of \"135 tiles · you 20\".",
    "The offer dock gives you 10 seconds to confirm a paid offer, shows Sending… after you confirm, and can accept offers with resource supply.",
    "First Contact no longer calls the first House you spot an enemy, and points to Diplomacy as well as mustering.",
    "Sending an alliance offer is logged in Activity, as a truce offer already was."
  ]
};
