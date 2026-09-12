// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_49: ClientChangelogEntry[] = [
  {
    createdAt: 1789149360439, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.12.01",
    title: "Fixed: a muster flag that no longer exists could get stuck on your tile, refusing to clear",
    why: "When the server removed a muster flag on its own -- most often the automatic clear that refunds a flag left untouched for two days -- and you weren't connected to see it happen, your client kept showing the flag. Re-selecting the tile didn't help: the tile-detail refresh that's supposed to re-sync a tile never mentioned muster at all when a tile had none, so the client read the silence as \"unchanged\" and kept the phantom flag forever. Pressing Clear Muster then failed with \"you can only stage muster on your own land tiles\" every single time.",
    changes: [
      "A full tile-detail refresh now explicitly reports \"no muster flag here\", so a stale flag disappears as soon as you select the tile",
      "A rejected muster action (Clear Muster, Set Hold/Advance, Expand Capacity) now immediately pushes fresh tile detail for that tile, so a phantom flag clears itself instead of leaving you re-pressing a button that can't succeed"
    ]
  },
];
