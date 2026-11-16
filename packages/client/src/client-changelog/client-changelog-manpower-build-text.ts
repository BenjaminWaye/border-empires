import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MANPOWER_BUILD_TEXT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Ancillary Factory and Reserve Lattice descriptions",
  why: "The town build list showed \"undefined\" instead of a description for the Ancillary Factory and Reserve Lattice.",
  changes: [
    "Build Ancillary Factory and Build Reserve Lattice now describe what each structure does"
  ]
};
