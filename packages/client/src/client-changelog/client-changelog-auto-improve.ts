import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AUTO_IMPROVE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Auto-improve by resource",
  why: "The build-on-all-tiles checkbox only worked once, for tiles you already had.",
  changes: [
    "Auto-improve works like auto-garrison: switch it on for a resource and its improvement is built on every garrisoned tile of that resource, including ones you garrison later",
    "Choose resources one by one, e.g. Mines on titanium only or Reclamation Works on salvage sites only",
    "Set it from the checkbox under a resource improvement's Place button, or in Settings > Gameplay",
    "It builds only when you have the tech, coin, manpower and a free slot, and garrisoning comes first"
  ]
};
