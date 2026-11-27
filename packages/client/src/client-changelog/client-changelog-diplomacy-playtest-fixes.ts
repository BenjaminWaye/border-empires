import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DIPLOMACY_PLAYTEST_FIXES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Diplomacy keeps who you've met",
  why: "Diplomacy could show \"Empires you've met · 0\" or forget rivals you fought or truced, an ✕ declined offers, and attacks started wars without warning.",
  changes: [
    "Empires you've met are saved to your account, so they stay listed on any device and after clearing site data",
    "Empires you are at war with are always listed as met",
    "Incoming offers in Diplomacy show a Decline button instead of an ✕",
    "Countering an offer is no longer blocked by the wait from your own refused offer",
    "The attack confirm says \"Starts war with …\" when the attack starts a war",
    "Truce offers in the feed show the time left, not the hours first offered"
  ]
};
