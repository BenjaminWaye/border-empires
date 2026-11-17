import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_SCREEN_BIOTA_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Town screen shows luxury biota",
  why: "A City short of luxury biota gave a smaller town's manpower, but its town screen never mentioned biota and showed the full manpower cap.",
  changes: [
    "Cities and larger towns list their luxury biota under Town bonuses: slots received of slots needed.",
    "A town short of biota shows what to do next: research Frontier Export Charter, garrison or build a Cultivation Estate on your biota, or go to the nearest biota you've seen. Press a name or coordinates to open it.",
    "An unruly town's Manpower cap card now shows the manpower it actually gives and the tier it's working as."
  ]
};
