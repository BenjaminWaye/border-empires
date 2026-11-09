import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Moved verbatim out of client-changelog-data.ts to keep it under 500 lines.
export const AI_PRICING_TEMPERAMENTS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794075196542, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07.1",
    title: "AI truce and alliance prices now follow real income",
    why: "AI empires priced deals as if everyone earned at least 1 coin a minute, far above real income, so a neighbour truce cost 720 to 1,080 coin or more.",
    changes: [
      "AI prices are based on real income, with a minimum of 10 coin a day",
      "AI empires losing a war pay for peace from their real income too, so those payments are smaller"
    ]
  },
  {
    createdAt: 1794075703761, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07.1",
    title: "AI empires have temperaments",
    why: "Every AI empire haggled the same way, so it made no difference who you were dealing with.",
    changes: [
      "Each AI empire is Measured, Merchant, Warlike, Peaceable or Vengeful, shown on the trade screen and the same every season",
      "Temperament changes truce prices, how much lost land angers them, how far gifts go, and how readily they seek or pay for peace"
    ]
  },
  {
    createdAt: 1794087791822, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07.2",
    title: "AI prices follow the AI's own income",
    why: "AI empires charged more when you were richer, even a poor AI that had no reason to.",
    changes: [
      "Truce and alliance prices depend only on the AI's income, so a strong economy can buy off weak neighbours cheaply",
      "Gifts win goodwill at 10 minutes of the AI's income per point, never less than 2 coin a point"
    ]
  }
];
