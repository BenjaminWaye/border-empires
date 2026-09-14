// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_58: ClientChangelogEntry[] = [
  {
    createdAt: 1788954892104, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.06",
    title: "Added a \"Go to tile\" button to the capture result popup",
    why: "The on-map capture-alert popup (the card that flashes up with the result of an attack/claim/expand) already showed the tile's name and coordinates as plain text -- but unlike the Activity Feed's matching entry, it had no way to actually jump to that tile.",
    changes: [
      "The capture result popup now shows a \"Go to tile\"/\"Center\" button whenever the result names a specific tile, matching the Activity Feed's existing behavior",
      "Clicking it centers the map on that tile, same as the Activity Feed's button"
    ]
  },
  {
    createdAt: 1788954892103, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.05",
    title: "Space View got a full steampunk visual redesign -- brass, copper, and riveted panels",
    why: "The galactic layer's chrome, Senate panel, and Fleets panel each used a different generic dark-UI palette that didn't feel like part of the same game, let alone a future-steampunk empire.",
    changes: [
      "Space View's top bar, launcher, and settings panel now use a shared brass/copper instrument-panel look -- aged leather and gunmetal backgrounds, amber-glow brass accents, parchment-cream text",
      "The Senate panel now reads in verdigris-copper and the Fleets panel in forge-copper/orange, each keeping a distinct accent on top of the same shared base so the panels stay easy to tell apart",
      "Incoming-raid warnings in the Fleets panel keep their red alarm color on purpose -- that's a deliberate warning, not part of the decorative theme",
      "The first-visit Voyager's Briefing modal is now reconciled with the same palette"
    ]
  }
];
