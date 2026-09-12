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
  },
  {
    createdAt: 1788876273395, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.01",
    title: "Activity Feed now backfills the last 24h after you log back in",
    why: "The Activity Feed was always empty right after logging in or reloading -- it only ever showed events that happened after you connected, silently discarding everything that came in while you were offline even though the server already kept that history.",
    changes: [
      "On login/reconnect, the Activity Feed now backfills entries from the last 24 hours instead of starting empty",
      "Backfilled entries, and any that arrive later while the feed panel isn't open, are marked unread with a highlighted left border so you can see what's new since you last checked",
      "Opening the Activity Feed panel clears the unread markers, same as it already did for the feed's notification badge"
    ]
  }
];
