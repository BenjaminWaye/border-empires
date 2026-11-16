import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AUTO_GARRISON_ASK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Garrison asks before going automatic",
  why: "New players never noticed the small \"garrison automatically\" checkbox under the Garrison button.",
  changes: [
    "The first time you garrison a town, farm, fish or resource type, the tile panel asks whether to garrison that kind automatically from now on, with Yes and No buttons",
    "Choosing No shows the checkbox highlighted, so you can see where to turn it on later"
  ]
};
