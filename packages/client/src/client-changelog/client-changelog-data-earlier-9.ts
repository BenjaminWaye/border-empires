// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_9: ClientChangelogEntry[] = [
  {
    createdAt: 1788292380551, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "Added a localhost-only developer login bypass (no player-facing effect)",
    why: "Testing gameplay and visual fixes end-to-end required a real Firebase sign-in even on localhost, which blocked automated/agent-driven testing against a local dev server. This entry exists only because this file gates all packages/client/src changes -- there is no change to how any real player signs in.",
    changes: [
      "On localhost only, opening the client with ?devPlayerId=<id> now authenticates directly as that player id instead of going through Firebase sign-in -- inert everywhere else, including staging and production"
    ]
  },
  {
    createdAt: 1788277344382, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.3",
    title: "Fixed ally buildings never appearing on the map, and a false \"missing weapons factory\" attack bonus",
    why: "Allying/unallying with another player only recorded the shared-vision change internally -- it never triggered the delivery of the resulting reveal/fog tiles to the client, which only happened to piggyback on some other, unrelated tile change happening anywhere in the world. On a quiet game, an ally's already-built structures could go unrendered on the map indefinitely despite the tile being genuinely visible. Separately, the map's fog-of-war logic also hid a tile's buildings the instant it fell outside your own live vision even though the territory tint itself stayed visible on such tiles, and the attack preview's \"missing Titanium/Umbrite Weapons Factory\" +100% attack bonus was computed only from tiles in the attacker's own subscribed vision, so breaking an alliance (which immediately drops the shared ally vision that used to cover the target's whole territory) could make the preview wrongly claim a target was missing a factory it actually had.",
    changes: [
      "Allying/unallying now reveals or fogs the other player's territory promptly instead of waiting on an unrelated tile change elsewhere in the world",
      "Buildings on a previously-seen but currently out-of-vision tile (e.g. an ally's territory) now stay visible on the map instead of disappearing",
      "The attack preview's weapons-factory attack bonus now reflects what the target actually owns, regardless of the attacker's current vision of them"
    ]
  },
  {
    createdAt: 1788275816752, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.2",
    title: "Dock/town/wonder sound cues no longer interrupt the war music",
    why: "Looking at a town, dock, or natural wonder tile plays a short one-shot theme that ducks the ambient music bed out and fades it back in afterward. That's the right behavior for the calm playlist, but it also fired during an incoming-attack or active-battle track, so clicking a dock mid-battle would silence the tension/combat music and then restart it from scratch a beat later -- cutting into the war music every time.",
    changes: [
      "Town/dock/wonder sound cues now just play on top of the war (incoming-attack or battle) music instead of pausing and restarting it"
    ]
  },
  {
    createdAt: 1788274601196, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.2",
    title: "Fixed collected Shards not showing up in your stock",
    why: "Collecting a Shard credited the strategic-resource ledger correctly, but the COLLECT_SHARD command handler was the only progression command that never invalidated the player's cached economy snapshot afterward -- so the shard stock shown to the client stayed frozen at its pre-collect value until some unrelated action happened to bust the cache later.",
    changes: [
      "Shard stock now updates immediately after collecting a Shard tile"
    ]
  },
  {
    createdAt: 1788237034064, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.01.1",
    title: "Removed fort garrison fill",
    why: "Forts used to hold a separate \"garrison\" pool that slowly refilled from wasted manpower overflow and drained a little on every repulsed assault, scaling the fort's combat defense bonus by how full that pool happened to be. That made a fort's real strength invisible and punished it for simply being attacked (even successfully defended attacks wore it down), on top of a defense system that's a flat multiplier everywhere else.",
    changes: [
      "A fort's defense bonus is now always fully applied while it's active -- no more partial bonus from an unfilled or worn-down garrison",
      "Removed the Garrison line from the fort tile menu; capturing a fort now simply shows the flat mustered-manpower requirement for its tier"
    ]
  },
  {
    createdAt: 1788208114112, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.4",
    title: "Fixed \"March To…\" muster orders never reaching your empire",
    why: "The gateway's SET_MUSTER message schema only allowed mode HOLD or ADVANCE -- MARCH was missing -- so every march order the client sent was rejected outright as a malformed message before it ever reached the simulation, and the muster flag silently stayed on its old mode.",
    changes: [
      "\"March To…\" now correctly arms and sends its target, and the muster flag switches to marching toward the chosen tile"
    ]
  },
  {
    createdAt: 1788208613354, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.5",
    title: "Reduced 3D map CPU/GPU load from the Aether Survey Line border overlay",
    why: "The border-pylon/line-segment placement pass recomputed a full visibility filter and every transition animation from scratch on every single rendered frame, even with the camera completely idle -- a captured performance trace showed this as the dominant, unthrottled main-thread and GPU cost, keeping the 3D renderer near-saturated continuously and driving unnecessary heat/fan load on laptops.",
    changes: [
      "The 3D map's border overlay now recomputes pylon/segment placement on the same throttle as terrain rebuilds instead of every frame -- already-placed pylons keep animating smoothly in between, so there's no visible difference, just lower CPU/GPU usage while the map is on screen"
    ]
  }
];
