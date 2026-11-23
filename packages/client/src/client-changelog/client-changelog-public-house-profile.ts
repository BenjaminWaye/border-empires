import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PUBLIC_HOUSE_PROFILE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Share your House profile",
  why: "A Sector Contest you don't win should still leave you something to show. Your record now has a web page you can send to anyone.",
  changes: [
    "Your profile has a Share profile button that makes a public link",
    "The page shows your contests, placements, rating, House Charges held and records, and opens without signing in",
    "It shows your House name and results only, and nothing is public until you press Share"
  ]
};
