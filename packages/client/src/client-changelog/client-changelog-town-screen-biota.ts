import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_SCREEN_BIOTA_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Town screen shows luxury biota",
  why: "A City short of luxury biota gave a smaller town's manpower, but its town screen never mentioned biota and showed the full manpower cap.",
  changes: [
    "Cities and larger towns list their luxury biota under Town bonuses: slots received of slots needed, and that a Cultivation Estate supplies 2.",
    "An unruly town's Manpower cap card now shows the manpower it actually gives and the tier it's working as."
  ]
};
