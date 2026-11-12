import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DIPLOMACY_DEALS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794472642567, // Date.now() captured once for this entry.
    introducedIn: "2026.11.12",
    title: "One-press deals with AI empires",
    why: "Getting an AI to take a resource trade meant adding 1 Food at a time until it said yes, and Suggest deal never appeared for resource trades.",
    changes: [
      "Pressing a good on your side of a deal adds exactly the amount the AI needs to accept, when you have enough of it",
      "When a deal already gives the AI more than it needs, pressing one of its goods asks for as much as the extra pays for",
      "Suggest deal now works for resource trades: it tops up what you're already offering (then coin), and asks for anything you'd overpay",
      "A declined resource trade says how much more the AI wants"
    ]
  },
  {
    createdAt: 1794474358888, // Date.now() captured once for this entry.
    introducedIn: "2026.11.12",
    title: "AIs sell their surplus and pay to stop losing wars",
    why: "AIs only ever bought Food, and an AI being overrun right after your attack would never pay for peace or ask for it.",
    changes: [
      "An AI with spare Food, Titanium, Crystal or Umbrite offers a few slots to a neighbour who has run out, for a day's value in coin",
      "An AI losing land fast, with no reload of its armies that could stop you, now offers to pay you for a truce, even straight after your attack, and pays more the faster it is losing",
      "An AI that is behind but reloads soon, stronger than you will be by then, fights on instead and says when its armies reload"
    ]
  }
];
