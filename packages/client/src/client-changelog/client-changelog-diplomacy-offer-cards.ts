import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_DIPLOMACY_OFFER_CARDS: ClientChangelogEntry[] = [
  {
    createdAt: 1792418764643, // Date.now() frozen for this entry, as required by the changelog gate.
    introducedIn: "2026.10.18.3",
    title: "Diplomacy offers say what's offered, and you can counter them",
    why: "Pending offers in the Alliances tab only showed a name, an internal player ID and a duration, so it wasn't clear whether a card was an alliance or a truce, and the only answers were yes or no.",
    changes: [
      "Pending offers now read \"Offers an alliance\" or \"Offers a 12h truce\" under the player's name (\"You offered…\" for your own)",
      "New Counter button on offers you receive: it opens the trade screen with their offer filled in, so you can change the duration or ask for coin (\"only if you pay 24 coin\") and send it back",
      "Sending a counter replaces their offer with yours, without the 30-minute wait a plain Reject puts on them offering again",
      "Internal player IDs are no longer shown on alliance, truce and ally cards"
    ]
  }
];
