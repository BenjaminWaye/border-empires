import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RESTORED_CAMERA_LOST_LAND_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Coming back opens on your land, not empty fog",
  why: "The map reopens where you last looked. If you lost that land while away, you came back to an empty grey map and could think your whole empire was gone.",
  changes: [
    "If none of your land is near where you last looked, the map now opens on your empire instead."
  ]
};
