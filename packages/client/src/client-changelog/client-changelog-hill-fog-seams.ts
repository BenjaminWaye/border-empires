import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const HILL_FOG_SEAMS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Smoother ground and cleaner fog on the 3D map",
  why: "The 3D ground showed straight lines along tile edges on beaches, sandy hills and sand/tundra corners. Hills beside woods stood out as bright squares, and hills in the fog had pale outlines.",
  changes: [
    "The ground texture now flows across tile edges, so beaches, sand and tundra no longer show a grid of straight lines",
    "Hills beside forests now share the darker forest-floor tone of the ground around them",
    "Hills in the fog no longer have pale outlines where they rise out of the mist"
  ]
};
