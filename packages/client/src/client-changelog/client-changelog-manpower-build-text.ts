import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MANPOWER_BUILD_TEXT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Missing building descriptions",
  why: "The build list showed \"undefined\" for the Ancillary Factory and Reserve Lattice, and a blank description for the Cultivation Estate and Reclamation Works.",
  changes: [
    "Build Ancillary Factory and Build Reserve Lattice now describe what each structure does",
    "Build Cultivation Estate and Build Reclamation Works now describe their deposit",
    "Ancillary Depot and Reserve Lattice text no longer promises an extra +300 manpower cap. Each Depot gives +150 cap plus 10% of its town's base capacity, or 35% with a Reserve Lattice"
  ]
};
