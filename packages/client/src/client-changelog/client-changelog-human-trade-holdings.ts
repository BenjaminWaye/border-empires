import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HUMAN_TRADE_HOLDINGS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "See what other players can trade",
  why: "Trading with another player showed every good on their side with no amounts, so there was no way to tell what they could actually give.",
  changes: [
    "The deal screen now shows an online player's coin and spare supply, just as it already did for AI Houses.",
    "Goods they have none of are hidden, and you can't ask for more than they hold.",
    "If the other player is offline, their side still shows no amounts."
  ]
};
