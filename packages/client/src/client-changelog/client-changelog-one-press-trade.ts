import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ONE_PRESS_TRADE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "One-press deals with AI empires",
  why: "Getting an AI to take a resource trade meant adding 1 Food at a time until it said yes, and Suggest deal never appeared for resource trades.",
  changes: [
    "Pressing a good on your side of a deal adds exactly the amount the AI needs to accept",
    "When a deal already gives the AI more than it needs, pressing one of its goods asks for as much as the extra pays for",
    "Suggest deal now works for resource trades: it tops up what you're already offering (then coin), and asks for anything you'd overpay",
    "A declined resource trade says how much more the AI wants"
  ]
};
