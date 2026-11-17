import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const REFINERY_GIVES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.17",
  title: "Refineries show what they give",
  why: "A refinery's Gives line showed a per-tile rate and a reach distance, not what it was actually producing.",
  changes: [
    "Your refinery's Gives line now shows its live output, like \"+6 Titanium slots · 3/3 field tiles garrisoned\", or warns when it gives nothing and why.",
    "Other players' refineries show the slots per garrisoned field tile, named by resource. The 10-tile reach moved to the build info."
  ]
};
