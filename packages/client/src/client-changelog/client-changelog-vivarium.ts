import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const VIVARIUM_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Vivarium: keep a big town content without luxury biota",
  why: "A City, Great City or Metropolis with no biota deposit nearby stayed unruly and gave a smaller town's manpower.",
  changes: [
    "Big towns need more luxury biota at each tier: a City 1 slot, a Great City 3 (was 2), a Metropolis 6 (was 3). A town short of its need gives the manpower of the highest tier its slots cover",
    "New Manpower building, unlocked by Census Office: build a Vivarium on a town's support tile for 200 manpower and 1 food slot of upkeep",
    "Each Vivarium covers one of that town's luxury biota slots, so it needs one less from your biota sites; build more to cover more",
    "The town screen shows how many slots its Vivaria cover and offers a Vivarium when the town is short"
  ]
};
