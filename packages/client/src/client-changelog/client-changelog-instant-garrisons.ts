import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INSTANT_GARRISONS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793807218299, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Faster garrisons, and your first 10 are instant",
    why: "Garrisoning took a full minute (two in forests and hills), far longer than claiming the same tile, which made holding new land feel slow.",
    changes: [
      "A garrison now takes exactly as long as claiming that tile (7.5s, or about 11s in forests and hills), before settle-speed bonuses",
      "Your first 10 garrisons ever are instant. The tile menu shows how many free ones you have left",
      "The count carries over when you respawn, so it doesn't refill",
      "A tile still held after a capture still can't finish garrisoning before its hold ends"
    ]
  }
];
