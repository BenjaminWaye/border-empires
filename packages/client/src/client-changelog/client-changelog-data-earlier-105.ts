import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Split out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_105: ClientChangelogEntry[] = [
  {
    createdAt: 1792042002455, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "War music stops when your flag has nothing to fight",
    why: "An advancing muster flag on a border with a truce partner kept battle music playing even though it could not attack.",
    changes: [
      "Advance and March flags with no target in range no longer keep battle music playing"
    ]
  },
  {
    createdAt: 1792062991009, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Captured tiles can't be taken straight back",
    why: "A freshly captured dock or town lands as frontier, and frontier had no defense, so the old owner could retake it for free and captures just went back and forth.",
    changes: [
      "For 1 minute after you capture a tile from another player, your troops stay standing on it and it defends like ordinary ground, so retaking it is a real fight",
      "If it is attacked during that minute, those troops are the defenders in the battle; time to garrison it is what the minute is for",
      "The tile menu shows a Holding captured ground countdown, and in 2D the holding troops are drawn on the tile with a bar for the time left"
    ]
  },
  {
    createdAt: 1792203815485,
    introducedIn: "2026.10.17.1",
    title: "Enemy breakthroughs get a spiked front line",
    why: "Enemy tiles taken inside your reach only had a plain outline, which didn't read as a break-in.",
    changes: [
      "On the 3D map, enemy land inside your reach is now outlined by a thin front line in the attacker's colour, with tall spikes pointing into your land",
      "Spikes only appear where the enemy touches your own land, and the line stops at the old border when they push across it",
      "The 2D map keeps the plain outline for now"
    ]
  }
];
