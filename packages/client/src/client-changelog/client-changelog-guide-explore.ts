import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const GUIDE_EXPLORE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Guide: Explore first",
  why: "The guide never mentioned your scout drone, so new players looked for towns and rivals by building Relay Beacons or by waiting.",
  changes: [
    "A new step after looking around: tap the marked unexplored ground and Explore.",
    "With no town or food in sight, the guide asks for a scout drone flight before a Relay Beacon, and says when the drone is out.",
    "Towns and food your drone found stay on the guide's list after the fog closes back over them.",
    "Food you've found outside your reach asks for a Relay Beacon, since only reach lets you garrison it.",
    "The Contest and Diplomacy steps, and the guide's last step, point you to Explore."
  ]
};
