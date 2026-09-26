import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_92: ClientChangelogEntry[] = [
  {
    createdAt: 1789926100461,
    introducedIn: "2026.09.22.5",
    title: "A disabled Relay Beacon's heliograph mirrors no longer keep spinning in the 3D map",
    why: "The 3D Relay Beacon model's mirror array and drive gears animated continuously regardless of the beacon's status, so a disabled (out-of-FOOD-slot) beacon looked identical to an active one at a glance -- there was no visual cue that it had stopped working.",
    changes: [
      "A Relay Beacon's mirror array now freezes in place on the 3D map while the beacon is disabled, and resumes spinning once it's active again"
    ]
  },
  {
    createdAt: 1789926100462,
    introducedIn: "2026.09.23.1",
    title: "Siphon now steals resource slots and lasts until you cancel it",
    why: "Siphon used to zero an enemy's town and resource output for 60 minutes, but nothing actually reached the caster even though the tooltip said it siphoned at 100% -- and it never touched the resource slots your structures run on.",
    changes: [
      "Casting Siphon locks one of your Aether Towers into siphon mode. While it lasts, every siphoned enemy resource tile's slots count for you instead of its owner -- their structures may go dormant, and yours may wake up. Siphoned towns still produce nothing",
      "No more 60-minute timer: the siphon lasts until you pick the tower and choose Cancel siphon, the owner switches on an Aether Tower whose protection covers the siphoned tiles, your tower is lost or switched off, or a siphoned tile changes hands",
      "A tower in siphon mode can't cast other abilities; its 10-minute cooldown starts when the siphon ends",
      "Tiles already covered by their owner's own Aether Tower can't be siphoned",
      "Towers in siphon mode show a crimson drain badge on the 3D map and a crimson ring with a teal spiral on the 2D map"
    ]
  },
  {
    createdAt: 1789926100463,
    introducedIn: "2026.09.24.2",
    title: "Tapping a waystation now shows its status in the tile overview",
    why: "Selecting a waystation showed nothing waystation-specific, so you couldn't tell whether it was still up for capture or what it had granted.",
    changes: [
      "The tile overview shows whether a waystation is Dormant (capturable) or Active",
      "Active waystations list the permanent effect they granted and who activated them"
    ]
  },
  {
    createdAt: 1789926100464,
    introducedIn: "2026.09.25.1",
    title: "The tile overview now leads with what's special about the tile",
    why: "Waystations, buildings, natural wonders and shard sites were buried under generic ownership text like \"Frontier land is visible control\", and the waystation was a single plain sentence.",
    changes: [
      "Buildings, waystations, natural wonders and shard sites now appear at the top of the tile overview, above the generic frontier/settled text",
      "Waystations get their own block with Status (Dormant/Active), what they granted and who activated them",
      "The repeated Frontier/Settled heading and generic explanations are gone from the overview; tap the ownership label under the tile name (e.g. \"Your frontier\") to read what Unclaimed, Frontier and Settled mean"
    ]
  }
];
