import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TUTORIAL_GUIDE_TOWN_FIRST_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793825222699, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Fixed: the guide told you to build a Relay Beacon on a town",
    why: "Every guest on the same browser shared one save, so a new guest could inherit an earlier guest's finished checklist and the guide skipped \"A foothold\". Its Relay Beacon step could then mark a neutral town as the place to build the beacon instead of asking you to take it.",
    changes: [
      "Each guest account now keeps its own hints, guide progress and checklist instead of sharing them with other guests on the same browser",
      "\"A foothold\" now checks the land you actually hold, so it is no longer skipped on accounts that finished the old checklist in an earlier season or before restarting the guide",
      "The Relay Beacon step asks you to Garrison or Expand To a town you can take first, since a town pushes your reach out by itself, and only then asks for a beacon",
      "Recommended Relay Beacon tiles are never a town or a dock"
    ]
  }
];
