import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MARCH_STEERING_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793225946704, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.2",
    title: "Marches head for their target and are easier to steer",
    why: "A march sent around mountains spread over every tile near its path instead of heading for the target, and never attacked the town or structure it was sent to take. Changing a march also meant zooming into the town every time.",
    changes: [
      "Marches follow one narrow path to their target, even on long routes around mountains or water.",
      "Marches can now go up to 30 tiles away.",
      "A march on an enemy town or structure first takes two tiles next to it, then attacks it, saving up manpower if it needs to.",
      "While picking a march target, a banner tells you to tap the destination, shows the distance and has a Cancel button. An arrow follows your pointer.",
      "Drag a march's target on the map to move it, or use Change Target on the flag.",
      "Tapping a town or support tile with your flag on it selects the flag. Tap again to open the town screen.",
      "Raise flag on the town screen now raises it on the support tile you selected, not on the town."
    ]
  }
];
