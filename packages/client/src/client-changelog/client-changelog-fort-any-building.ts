import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FORT_ANY_BUILDING_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Forts can now go on tiles that already have a building",
  why: "A Palisade or fort could only be added to a tile with a Relay Beacon or Harbor Exchange, so a town support tile with a Manufactory, refinery or other building had no Fortify option. The town screen also listed the town's own \"Remove Fort\" while a support tile was selected, which made it look like that tile already had a fort.",
  changes: [
    "Fortify now shows on tiles with any building or an Aether Tower, and the fort stands alongside the building. Siege engines and forts still can't share a tile.",
    "With a support tile selected, the town screen's town-tile actions are marked \"(town)\", e.g. \"Remove Fort (town)\"."
  ]
};
