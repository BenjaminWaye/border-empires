// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_11: ClientChangelogEntry[] = [
  {
    createdAt: 1788451366292, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.3",
    title: "Muster flag Expand Capacity: capped at your manpower cap, and the menu now stays open to press again",
    why: "A muster flag's cap could be raised past the player's own manpower cap with enough Expand Capacity presses, letting a flag demand more manpower than the empire could ever actually hold -- the exact problem the cap was meant to prevent, just moved up a level. Separately, pressing Expand Capacity closed the tile menu every time, forcing the player to reopen it before the next press even though the whole point is pressing it repeatedly.",
    changes: [
      "A muster flag's cap can no longer be raised above the player's manpower cap, however many times Expand Capacity is pressed; the action now disables itself once a flag is already maxed out",
      "The tile menu now stays open after pressing Expand Capacity, updating live as the new cap comes back from the server, so you can press it again right away"
    ]
  }
];
