import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ALLIANCES_TAB_TRADE_SCREEN_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792273715221, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.17.1",
    title: "Alliances tab opens the trade screen",
    why: "The Truce and Propose Alliance buttons on the Alliances tab still sent the offer straight away, skipping the trade screen, so you never saw the empire's mood or price first.",
    changes: [
      "Truce 12h, Truce 24h and Propose Alliance on the Alliances tab now open the trade screen, where you set terms and see whether an AI would accept before sending"
    ]
  },
];
