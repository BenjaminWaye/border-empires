import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_RAID_REASON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "AI rulers own up to raiding you",
  why: "An AI that had taken your land overnight could still greet you with only \"looking for peace: their armies are spent\", as if nothing had happened.",
  changes: [
    "When an AI ruler has taken your tiles lately, its deal screen now says so first, for example \"Rowan took 7 of your tiles recently.\", followed by why it wants peace or not",
    "Accept messages from AI rulers, and declines that give their reason, carry the same line"
  ]
};
