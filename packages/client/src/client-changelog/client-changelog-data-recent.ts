import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_RECENT: ClientChangelogEntry[] = [
  {
    createdAt: 1790764192672, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.5",
    title: "Guest \"Save your empire\" badge no longer jumps when pressed",
    why: "Pressing the gold guest badge at the bottom of the map shifted it to the left while the button was held down.",
    changes: [
      "The badge now stays centred while you press it"
    ]
  },
  {
    createdAt: 1790768118179,
    introducedIn: "2026.09.30.5",
    title: "Choose what settles for you",
    why: "New empires used to spend their starting manpower settling nearby towns and farms automatically, before you had any say.",
    changes: [
      "You are now asked whenever towns, food or resources come within reach and aren't set to auto-settle: pick how many to settle and see the manpower cost first, or close it and carry on",
      "Auto-settle is now a per-category setting (towns & docks, food, other resources) in Settings > Gameplay, and stays on for existing players"
    ]
  },
  {
    createdAt: 1790764591773, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.4",
    title: "Slow server replies no longer strand an expansion",
    why: "When the server took more than 2 seconds to confirm an expansion, a late confirmation was thrown away and the tile stayed stuck on \"Expansion sync delayed\".",
    changes: [
      "A late expansion confirmation that arrives within 12 seconds is now picked up instead of ignored, so the claim completes normally"
    ]
  },
  {
    createdAt: 1791005026034, // frozen Date.now() value for this release
    introducedIn: "2026.10.03.1",
    title: "Clearer, shorter attacks on your frontier",
    why: "When an enemy muster flag attacked your frontier you only saw a red cross: no soldiers, a timer that could run for minutes, a 50/50 bar that looked like real odds, and counter-attacks that failed with \"tile locked in combat\".",
    changes: [
      "An enemy taking your frontier tile now looks the same as when you take theirs: your colour clears, theirs sweeps in, and their soldiers stand on the tile (3D and 2D)",
      "Muster-flag attacks no longer take minutes when the flag is across a dock or the map edge: travel is capped at the 15-tile march limit",
      "The Under attack card no longer shows a fake 50/50 odds bar, and says when the enemy is still marching or that frontier land has no defenders",
      "Attacking the tile an enemy is attacking you from now tells you up front how long it stays locked, instead of mustering and then failing",
      "A rejected muster attack no longer leaves its flag stuck and over-filling (70/60 climbing to 120) before it can fire again"
    ]
  }
];
