import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SCOUT_RECALL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Recall your scout drone",
  why: "A drone sent the wrong way had to finish its whole flight, and the launch popup only repeated the tap.",
  changes: [
    "A Recall drone button turns your scout drone back while it is still flying out. It flies home the way it came and reports what it saw",
    "The time until your drone is back now floats over it on the map, instead of in a popup when it launches",
    "On your AFC, Send scout drone is the main button unless an AFC upgrade is ready or a module can be called down"
  ]
};
