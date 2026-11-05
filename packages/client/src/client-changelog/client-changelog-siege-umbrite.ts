import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SIEGE_UMBRITE_ONLY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793359044231, // Date.now() captured once for this entry.
    introducedIn: "2026.10.30.1",
    title: "Siege structures need only Umbrite",
    why: "Siege Towers and Dread Towers also took Titanium slots, which competed with forts. If you couldn't afford a Siege Tower, you couldn't build any siege structure there at all.",
    changes: [
      "Siege Towers now take 2 Umbrite slots and Dread Towers take 3. Neither needs Titanium slots any more.",
      "If you don't have enough Umbrite for your best siege tier, the build menu offers a Siege Battery instead and tells you how much Umbrite the bigger tower needs."
    ]
  }
];
