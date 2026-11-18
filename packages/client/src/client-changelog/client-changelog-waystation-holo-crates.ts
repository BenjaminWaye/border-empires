import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAYSTATION_HOLO_CRATES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.18",
  title: "Waystations are now holo-locked supply caches",
  why: "Waystations should look like loot worth claiming, and collecting one should feel like opening a prize.",
  changes: [
    "Waystations are now a stack of armoured supply crates on a hovering pad, sealed under a hologram padlock, in both map renderers.",
    "When a waystation is collected, the padlock shatters, the front crate drops open and a glowing reward core rises out of it.",
    "Ten seconds later the cache teleports away and the tile is clear. The reward pool is unchanged."
  ]
};
