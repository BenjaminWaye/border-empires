import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TRUCE_OFFERS_WAIT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793791768085, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Truce offers wait for offline players",
    why: "A truce offer ran out after 5 minutes, so a player who was offline, even one emailed about the offer, never got to answer it.",
    changes: [
      "Truce offers now stay open until answered, cancelled, or a week passes",
      "If your empires fight, every pending truce offer between you is withdrawn and both of you are told",
      "The offer timer shows days and hours for offers with a long time left"
    ]
  }
];
