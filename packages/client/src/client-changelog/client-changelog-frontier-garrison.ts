import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FRONTIER_GARRISON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "Fixed: no Garrison button on plain frontier tiles early on",
  why: "Until you had a garrisoned town and food tile, plain frontier tiles hid Garrison and Garrison Many, though the tile's help said to garrison it.",
  changes: [
    "Your frontier tiles always show Garrison and Garrison Many; resource, town and dock tiles stay highlighted",
    "Outside your reach, Garrison shows greyed out with the reason and points to a Relay Beacon",
    "Kept desert, tundra and survey House Charges note that Garrison Many works inside your reach"
  ]
};
