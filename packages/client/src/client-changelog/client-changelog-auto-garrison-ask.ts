import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AUTO_GARRISON_ASK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Garrison asks before going automatic",
  why: "New players never noticed the small \"garrison automatically\" checkbox under the Garrison button.",
  changes: [
    "Where the tile panel used to show a small checkbox under Garrison, it now asks whether to garrison that kind of tile (towns, farms, fish or a resource) automatically from now on, with Yes and No buttons. It asks once per kind, and not for kinds already on",
    "Choosing No shows the checkbox highlighted for a moment, so you can see where to turn it on later. Changing a kind in Settings also counts as an answer"
  ]
};
