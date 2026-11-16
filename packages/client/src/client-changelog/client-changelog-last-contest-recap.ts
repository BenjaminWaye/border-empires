import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LAST_CONTEST_RECAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Reopen the last Sector Contest's recap, and unsubscribe from emails in one click",
  why: "The new-contest email promised a recap of the last Sector Contest, but the recap screen disappeared as soon as the next contest started, and the emails had no unsubscribe link.",
  changes: [
    "A Last Contest Recap button on the leaderboard and on the join-contest screen reopens the last Sector Contest's recap any time: final standings for every player, victory paths, statistics and the score graph.",
    "While the current contest's winner is still on record, the same button brings back that contest's end screen after you dismissed it with Look Around.",
    "The new-contest email links straight to the recap.",
    "Every gameplay email now has an Unsubscribe link, and mail apps show their own unsubscribe button. You can switch off just that kind of email or all of them; Settings → Email Notifications still controls each kind."
  ]
};
