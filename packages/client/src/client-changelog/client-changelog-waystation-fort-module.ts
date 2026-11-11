import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAYSTATION_FORT_MODULE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Waystation modules now reach your AFC",
  why: "A Titanium Forge Module won from a waystation was never installed, so Forts stayed locked and the Palisade disappeared.",
  changes: [
    "AFC modules granted by a waystation are now installed on your AFC, just like researched ones.",
    "Palisade stays available until a Fort can actually be built."
  ]
};
