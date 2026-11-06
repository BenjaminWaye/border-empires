import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SALVAGE_TRIBUTE_UI_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: Date.now(),
    introducedIn: "2026.11.06",
    title: "Depleted salvage fields clear correctly",
    why: "The map could restore an empty salvage field after removing its Reclamation Works.",
    changes: ["Shipping the final salvage load removes both the field and its Works in the 2D and 3D maps"]
  },
  {
    createdAt: 1793955099378, // Date.now() captured once for this entry.
    introducedIn: "2026.11.06",
    title: "Shipping salvage to the Court",
    why: "Salvage ready to ship was easy to miss, shipped without a check, and an emptied field stayed on the map.",
    changes: [
      "Ship salvage is the gold main button on a Reclamation Works while a load can ship",
      "Shipping opens a popup with the manpower delivery and loads left before anything is sent",
      "Each of your working salvage fields shows a toast on the map; tap it to ship",
      "An emptied salvage field disappears from the map straight away"
    ]
  }
];
