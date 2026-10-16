import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FAIRER_AI_DEALS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792107390391, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.16.1",
    title: "Fairer AI deals",
    why: "A few gaps in the new trade screen let deals go wrong: a slow payment could take your coin without the deal, and an AI's old counter-offer could be accepted after you'd attacked it.",
    changes: [
      "If a deal's payment goes through after it was reported as failed, the coin and Shards are paid straight back",
      "An AI checks its counter-offer again when you accept it, and withdraws it if you've attacked it since or its price has gone up",
      "An AI that is outmatched but taking your land no longer pays you for peace; it charges for it instead",
      "An AI that can't yet tell how big its alliance would be declines for now instead of guessing",
      "The trade screen keeps your coin, the verdict and the top-up suggestion up to date while it's open"
    ]
  }
];
