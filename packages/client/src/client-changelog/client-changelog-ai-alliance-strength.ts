import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AI_ALLIANCE_STRENGTH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Strong AI neighbours would rather take your land",
  why: "An alliance pledges you to help its biggest member win, so a strong AI gladly takes a small ally far away. A weak neighbour is land it could take instead.",
  changes: [
    "An AI much stronger than you, on your border, refuses an alliance while your border towns and resources are unfortified",
    "Fortify them, or hold nothing worth taking there, and it may agree",
    "An AI already fighting wars on other fronts keeps the alliance rather than start another",
    "Every 4 hours an AI rechecks its weak allies: leave a border town or resource unfortified again and it may give 24h notice to leave",
    "Alliance offers say what an alliance binds you to"
  ]
};
