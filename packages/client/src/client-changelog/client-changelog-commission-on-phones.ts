import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COMMISSION_ON_PHONES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793809444101, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Fixed: Commission did nothing on phones",
    why: "On a phone, a discovery tip (such as \"First Contact!\") could sit over the bottom of the Manifest screen and take your taps, so pressing Commission did nothing. Separately, if the server turned a commission away before it ran, every later Commission press was ignored until the game reconnected, and the reason only went to an activity feed the new HUD doesn't show.",
    changes: [
      "Discovery tips step aside while Manifest, Towns, Diplomacy or any other full screen is open, and come back when you return to the map",
      "Commission reads \"Commissioning…\" while the server confirms your order",
      "If no confirmation comes within 30 seconds, or the server refuses the order, you can press Commission again",
      "A press that can't go through now says why in an alert, for example when you are disconnected"
    ]
  }
];
