import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_OFFER_CARDS: ClientChangelogEntry[] = [
  {
    createdAt: 1792354516542, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.18.3",
    title: "Diplomacy offers say what's being offered",
    why: "Pending offers in the Alliances tab only showed a name, an internal player ID and a duration, so it wasn't clear whether a card was an alliance or a truce.",
    changes: [
      "Pending offers now read \"Offers an alliance\" or \"Offers a 12h truce\" under the player's name (\"You offered…\" for your own)",
      "Internal player IDs are no longer shown on alliance, truce and ally cards"
    ]
  }
];
