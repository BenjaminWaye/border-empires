import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RIVAL_REACH_LINE_2D_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "2D map: rival reach borders",
  why: "On the 2D map a neighbour whose land was out of sight showed only an \"Inside <name> Reach\" label on your tile; only the 3D map drew other empires' reach borders.",
  changes: [
    "The 2D map now draws a thin line in each rival's colour along the edge of its reach, as the 3D map's rival border pylons do"
  ]
};
