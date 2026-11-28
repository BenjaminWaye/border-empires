import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FUNNEL_CONSENT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Our own sign-up statistics also wait for your answer",
  why: "Counting how visitors find and join the game keeps an identifier in your browser too, so it should follow the same choice as Google Analytics.",
  changes: [
    "The question about measuring visits now covers our own sign-up statistics as well as Google Analytics, and neither runs unless you say yes.",
    "The staging test site no longer runs any usage statistics."
  ]
};
