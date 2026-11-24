import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SEASON_AWARDS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Awards for Houses that fight back",
  why: "Being knocked out is not the end of a Sector Contest. Two awards now mark the Houses that came back.",
  changes: [
    "Never Gave Up goes to the House knocked out and redeployed the most times in a contest",
    "Comeback Kid goes to every House that was knocked out, redeployed and still finished in the top 5",
    "Awards are decided when a contest is won and show on your public House profile. Withdrawing by choice does not count"
  ]
};
