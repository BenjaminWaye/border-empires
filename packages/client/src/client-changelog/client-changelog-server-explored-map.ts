import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SERVER_EXPLORED_MAP_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Land you've explored stays explored",
  why: "The game only remembered explored land in your browser. After a server restart, a cleared browser or a new device, places you had already seen could turn back into unexplored storm.",
  changes: [
    "The server now remembers the land your empire and its allies have had in view this season and sends it whenever you connect.",
    "That land stays as remembered fog after restarts and on a new device or browser. A few brief glimpses, such as across a dock link, are still remembered only by your browser."
  ]
};
