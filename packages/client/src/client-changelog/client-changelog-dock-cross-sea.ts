import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DOCK_CROSS_SEA_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Your dock has a Cross the sea button",
  why: "Players on an island held a dock without knowing it was the way off.",
  changes: [
    "Your own dock shows Cross the sea when a sea lane leads somewhere new: it takes you to the dock across and opens it, ready to Expand To or Attack",
    "A lane that only reaches another of your docks is followed on to the first dock you don't hold",
    "Your docks' Connected docks row shows even on a new device",
    "A tile's main action no longer gets squeezed to a sliver beside Build, Aether and Details"
  ]
};
