import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_SLOW_3D_PROMPT_WARMUP: ClientChangelogEntry[] = [
  {
    createdAt: 1793777050575, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Fewer false \"3D is running slow\" prompts",
    why: "Coming back to the game after switching apps, or reconnecting, briefly drops the frame rate while the map catches up. That short dip triggered the \"Switch to 2D\" prompt even on fast phones.",
    changes: [
      "The slow-3D check now waits 20 seconds after you log in, reconnect or return to the app before it starts measuring",
      "The frame rate must stay low for 8 seconds (was 5) before the prompt appears"
    ]
  }
];
