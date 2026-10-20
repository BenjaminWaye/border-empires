import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_BASE_SKIRT_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792528401682, // Date.now() captured for this entry.
    introducedIn: "2026.10.20.5",
    title: "Town and muster bases no longer look black",
    why: "On the 3D map, the base under towns and muster flags showed as a dark band wherever the ground sloped away from it.",
    changes: ["In the 3D map, towns and muster flags now stand on a grey stone foundation that widens towards the ground and catches the light"]
  }
];
