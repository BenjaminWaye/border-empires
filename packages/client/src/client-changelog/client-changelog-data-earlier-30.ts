// Split out of client-changelog-data.ts once it approached the 500-line cap.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_30: ClientChangelogEntry[] = [
  {
    createdAt: 1788817679731, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.07.07",
    title: "Fixed: tile borders could show a stale reach owner until you clicked the tile",
    why: "When a town, dock, or outpost activated or deactivated and shifted the underlying reach border, the server only ever pushed the affected player's own updated tile-key list -- it never re-sent the actual tile data (including the new reach owner) to anyone else who could see those tiles. Other players' clients kept whatever reach-owner color they'd last been shown until they happened to click the tile and force a fresh fetch, or reconnected -- so border shifts from a captured/destroyed anchor could look wrong for an indefinite amount of time.",
    changes: [
      "Every tile whose reach owner actually changes (an anchor activating, deactivating, or being contested) now gets a fresh tile update pushed to everyone who can currently see it, not just the player whose own reach changed"
    ]
  }
];
