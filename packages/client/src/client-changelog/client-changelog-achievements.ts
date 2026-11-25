import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ACHIEVEMENTS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Achievements",
  why: "There were no long-term goals of your own to work toward beside the race for victory.",
  changes: [
    "Your profile has six achievement badges to earn this contest: Metropolis, Pacifier, Warlord, Cartographer, Master Builder and Iron Wall",
    "Each badge shows your progress until you earn it, and the Chronicle notes when you do"
  ]
};

export const LIVE_LONGEST_ROAD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Longest Road, live",
  why: "Longest Road was only revealed when the contest ended.",
  changes: ["Ranks shows who holds Longest Road right now, how long it is and which towns it joins, updated every 4 hours"]
};

export const LONGEST_ROAD_CADENCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Longest Road every 4 hours",
  why: "Checking every few minutes cost server time for a standing that changes slowly.",
  changes: ["The Longest Road holder on Ranks is now updated every 4 hours, and the card says so"]
};
