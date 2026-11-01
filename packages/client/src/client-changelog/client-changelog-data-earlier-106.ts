import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_106: ClientChangelogEntry[] = [
  {
    createdAt: 1791969768256, // Frozen Date.now() timestamp for the changelog gate.
    introducedIn: "2026.10.14.2",
    title: "Waystation rewards show current technology names",
    why: "The tile overview showed old technology names such as Leatherworking instead of their current Manifest names.",
    changes: ["All Waystation technology rewards now use the current tech catalog name in the tile overview, including previously activated sites"]
  },
  {
    createdAt: 1791969340091, // Date.now() captured once for this release.
    introducedIn: "2026.10.14.4",
    title: "Manifest details stay where you scroll",
    why: "Live game updates kept rebuilding Manifest details and jumping the menu back to the top.",
    changes: ["Mobile and desktop Manifest details keep their scroll position while coin and unlock status update"]
  },
  {
    createdAt: 1791970194502,
    introducedIn: "2026.10.14.2",
    title: "Hidden dock connections stay hidden",
    why: "Selecting an enemy dock lit up undiscovered linked docks on the minimap and offered navigation into fog.",
    changes: ["Selecting a dock no longer reveals hidden connections on the minimap or either map renderer", "Dock navigation only visits discovered destinations; garrisoning a dock reveals its links", "3D dock routes update as soon as linked docks are discovered, even while the same dock stays selected"]
  }
];
