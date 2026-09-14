// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_55: ClientChangelogEntry[] = [
  {
    createdAt: 1788950228122, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.02",
    title: "Space View: click a system to fly the camera to it, instead of being stuck orbiting the whole galaxy",
    why: "Player feedback: there was no way to move around in Space View's 3D galaxy -- the camera only ever orbited one fixed point at the galaxy's origin, so you could zoom in/out and rotate the whole cluster of systems but never actually go look at one up close.",
    changes: [
      "Clicking an unfocused system now flies the camera to it (keeping your current viewing angle) so you can freely orbit and zoom around just that one system",
      "Clicking the system you're already focused on now commits to entering its Sector",
      "Clicking empty space, or the new \"Galaxy View\" button in the top bar, flies the camera back out to the full galaxy view",
      "The camera can now zoom in much closer (down to a single system's own scale) than the old fixed minimum distance allowed"
    ]
  },
  {
    createdAt: 1788904106589, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.01",
    title: "Activity Feed now shows tile coordinates for plain-terrain conquests",
    why: "When a captured tile had no town, dock, or resource on it, the Activity Feed just said e.g. \"Tundra was conquered from Empire X\" with no way to tell which of your many tundra tiles it meant -- unlike town/dock/resource captures, which already read distinctly by name.",
    changes: [
      "Conquest entries for plain terrain now include the tile's coordinates, e.g. \"Tundra (12, 34) was conquered from Empire X\"",
      "The existing \"Center\" button on these entries still jumps the map straight to that tile"
    ]
  }
];
