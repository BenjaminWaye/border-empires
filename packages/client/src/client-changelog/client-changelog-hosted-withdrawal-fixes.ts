import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HOSTED_WITHDRAWAL_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Clearer withdrawal from a hosted sector",
  why: "A sector closed because nobody visited was never fully provided, so its buyer should still be able to withdraw, and a withdrawal should not look like any other refund.",
  changes: [
    "The button on your sector in My sectors now reads Withdraw from contract here.",
    "If a hosted sector is closed because nobody visited, you can still withdraw within 14 days of paying; only the days up to the closure are kept.",
    "A sector you withdrew from shows as Withdrawn."
  ]
};
