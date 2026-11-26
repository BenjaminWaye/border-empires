import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CHARGES_BUBBLE_ONCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.26",
  title: "House Charges: the sealed-charges note stays gone",
  why: "The note that your House handed you sealed charges kept coming back over the map, even after you had opened and kept your charges, and could hide guide targets.",
  changes: [
    "Once you have opened your charges, or closed the note with its x, it does not come back for that deal, also after a reload or on another account on the same device",
    "A new deal still brings the note back",
    "The first time, the docked cards pulse once with Charges live here",
    "A tap on the note's x no longer reaches the map or a button under it"
  ]
};
