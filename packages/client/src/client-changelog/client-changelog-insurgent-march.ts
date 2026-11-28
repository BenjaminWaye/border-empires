import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INSURGENT_MARCH_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Insurgents march out of their camps",
  why: "Insurgents struck along the whole edge of their land at once, as if their soldiers were already standing everywhere, and nobody saw them coming.",
  changes: [
    "Every Insurgent attack and expansion now sets out from its camp: their soldiers walk to the front before the fight or claim begins, so a large camp is slower to strike its far edge",
    "You can watch the Insurgent company walking on both the 3D and 2D maps whenever the camp, the front or the target is in your sight"
  ]
};
