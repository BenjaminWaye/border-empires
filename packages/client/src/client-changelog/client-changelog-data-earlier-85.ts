import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_85: ClientChangelogEntry[] = [
  {
    createdAt: 1789549757916, // frozen, newer than every existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.17.2",
    title: "Auto-settle now starts the instant a tile qualifies, instead of waiting up to 30 seconds",
    why: "The previous fix (2026.09.17.1) cached the auto-settle queue instead of rebuilding it from scratch, but every cache rebuild still re-scanned every one of a player's frontier tiles, including a wide town-support scan for tiles already known not to qualify. That kept a steady, avoidable cost on the server for large empires. Auto-settle now tracks eligibility directly at the moment it can actually change -- claiming a tile, a town growing a tier, a town changing hands, or a relevant tech finishing research -- instead of periodically re-checking everything.",
    changes: [
      "A tile that qualifies for free auto-settle (already inside your border, next to a big-enough town, or newly tech-revealed) now starts settling the same instant it qualifies, if a settle slot is free, instead of up to 30 seconds later",
      "When a settle finishes and frees up a slot, the next eligible tile now starts immediately instead of waiting for the next automation pass",
      "No other change to auto-settle's cost, manpower, or timing once started"
    ]
  },
  {
    createdAt: 1789549757918, // frozen, one past the previous newest entry
    introducedIn: "2026.09.17.4",
    title: "Mobile bottom tab bar reskinned to match the rest of the UI",
    why: "The steampunk reskin pass covered other shared chrome and feature panels (Fleet, Senate, tech detail, etc.) but never touched the mobile bottom navigation bar, so it was the last piece of the UI still showing the old plain dark/blue palette.",
    changes: [
      "Mobile tab bar now uses the brass/copper/parchment palette and fonts shared with the rest of the reskinned UI",
      "No layout or behavior changes -- colors and fonts only"
    ]
  },
  {
    createdAt: 1789656367089, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.17.5",
    title: "Hill tiles no longer show a black seam where they meet the coast (true-3D map)",
    why: "A hill tile's dome edge is stitched to match the main terrain grid's own corner heights, but the main grid additionally pins any corner touching the sea to a fixed coastal elevation instead of just averaging its land neighbours. The hill dome's edge stitching didn't know about that pin, so a corner where a hill bordered the coast used a plain land average while the main grid's matching corner used the lower coastal pin -- the two disagreed, and the dome edge sat above the real coast level with its underside/skirt showing through as a black seam.",
    changes: [
      "A hill tile's dome edge now matches the main grid's coastal pin at any corner touching the sea, instead of sitting above it -- fixes a black seam sticking up where a hill tile's edge met the coastline on the true-3D map",
      "2D canvas renderer unaffected -- it doesn't build a 3D dome mesh for hill tiles, so this seam never applied there"
    ]
  }
];
