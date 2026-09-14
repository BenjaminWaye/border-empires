// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_48: ClientChangelogEntry[] = [
  {
    createdAt: 1789198795333, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.12.02",
    title: "The Ambaric Transformer's name is now consistent everywhere",
    why: "The power-node structure (unlocked by Plastics, gates Aetherports/Resonance Grids/monuments) displayed as \"Ambaric Transformer Station\" in the buildings menu tooltip but as the bare, unrelated-sounding \"Aether Tower\" in its own build-menu label and in every server rejection message (e.g. \"World Engine requires a nearby Aether Tower\") -- inconsistent naming for the same building.",
    changes: [
      "The structure's display name is now \"Ambaric Transformer\" everywhere: the buildings menu label, its tooltip/detail text, and every server message that references it (Airport, World Engine, Aegis Dome, Astral Dock, Imperial Exchange, and Titanium Levy power-requirement rejections)"
    ]
  }
  // "Activity Feed now backfills the last 24h after you log back in"
  // (createdAt 1788876273395) aged out of the "latest week" rolling window
  // and was removed from this array -- see git history for the original
  // entry text.
];
