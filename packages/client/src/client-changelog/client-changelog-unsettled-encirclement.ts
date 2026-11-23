import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const UNSETTLED_ENCIRCLEMENT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Captures and new towns take the land they cut off",
  why: "Capturing or settling a town could turn a rival's nearby settled land into frontier without checking it for encirclement, so cut-off enemy frontier stayed inside your lines.",
  changes: [
    "When a capture or your newly settled town drops a rival's settled land to frontier, that land is now checked for encirclement. If it is cut off and touches your land, it becomes yours; otherwise it goes neutral."
  ]
};
