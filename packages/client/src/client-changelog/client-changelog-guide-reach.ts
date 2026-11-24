import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_REACH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Shorter last guide step",
  why: "The guide's last card was a long list nobody read.",
  changes: [
    "The last card now says only how your manpower refills, or to spend it when it's full"
  ]
};
