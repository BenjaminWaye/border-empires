import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SECTOR_BOARD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "Choose your Sector on the join screen",
  why: "Joining a running contest was a single Let's go! button, with no sign of how full the Sector was or what came next.",
  changes: [
    "Signed-in players joining a running Sector Contest see a Sector board instead of the old prompt",
    "The current Sector shows how many Houses hold it out of the cap, and whether it is open or full",
    "The next Sector shows how many Houses are already waiting for it",
    "Play now still drops guests straight into the current Sector"
  ]
};
