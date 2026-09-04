import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_15: ClientChangelogEntry[] = [
  {
    createdAt: 1788295509867, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "AI empires now react to a barbarian on their doorstep immediately, not just once things get serious",
    why: "The war footing added moments ago required the same \"is this serious\" bar for a barbarian tile as for an enemy empire's tile -- reasonable for a rival player (a single ordinary border touch with a neighbor is normal), but wrong for barbarians, which grow by eating neighboring tiles and periodically split into two independent barbarians once they've eaten enough. Waiting for that bar meant waiting for the barbarian to have already multiplied before reacting.",
    changes: [
      "A single land-connected barbarian tile now puts an AI empire on a war footing immediately, without needing the same sustained-pressure threshold a rival empire's border tile requires"
    ]
  },
  {
    createdAt: 1788297346755, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.3",
    title: "Fixed the 3D map's sea wave/lighting animation still restarting on nearly every tile update",
    why: "The two earlier fixes for this only closed the click-triggered REQUEST_TILE_DETAIL path. The much more common path -- the ordinary TILE_DELTA_BATCH stream that reflects every visible tile's server-side economy tick (yield, upkeep, and view-history bookkeeping recompute on essentially every step) -- bumped the tile-revision counter unconditionally on every single delta, even though neither map renderer reads any of those economy-only fields. Since that counter is the only signal the true-3D renderer's rebuild loop watches, a tile's gold ticking up a fraction anywhere in view kept forcing a full terrain + water-surface rebuild, which is what kept restarting the sea's wave/lighting animation with no player action at all.",
    changes: [
      "The 3D map's sea wave/lighting animation (and the rest of the terrain) no longer restarts from routine economy ticks -- only from a change that's actually visible on the map"
    ]
  },
  {
    createdAt: 1788296407361, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.3",
    title: "3D border line (Aether Survey Line) no longer disappears on distant islands or hides rival borders",
    why: "The border overlay's pylon/segment render pool had a fixed 96-slot cap sized against a wrong assumption (\"a pylon every ~10-15 boundary tiles\") -- a real reach boundary samples nearly every corner, so a modest 3-4 anchor empire already exceeded the cap on its own. The pool filled in list order (the local player's own pylons first, every other owner appended last), so islands beyond the first couple traced -- not the one the camera was looking at -- silently went unrendered, and a rival's border could never render at all once the local player's own pylons alone reached the cap.",
    changes: [
      "Border pylons/segments are now culled to the on-screen area before competing for a render slot, so whatever island the camera is actually looking at always gets its border drawn",
      "Remaining slots are shared fairly across every owner (round-robin) instead of draining in list order, so a rival's border can no longer be starved just by being computed after the local player's own",
      "The pool itself is larger, with more headroom for the connecting line (a dropped line segment leaves a visible gap) than for the decorative pylons along it"
    ]
  },
  {
    createdAt: 1788299049899, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.4",
    title: "Fixed login sometimes hanging forever on \"Connecting your empire...\"",
    why: "A recent change to how the client sends its login credentials to the server marked a login attempt as \"in progress\" before checking whether Google sign-in had actually finished loading. On a normal page load, that check can very plausibly lose the race and come back empty for the first attempt -- but the code path that handled \"not ready yet\" forgot to clear the in-progress marker, so every later attempt (including the one after Google sign-in finished) saw the marker still set and silently gave up before sending anything. The result was a login that connected fine but sat on the loading screen forever.",
    changes: [
      "Login retries again correctly after Google sign-in finishes loading, instead of getting stuck if the very first attempt happened before that"
    ]
  },
  {
    createdAt: 1788300674075, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.5",
    title: "Fixed a false \"missing weapons factory\" attack-preview penalty against offline opponents",
    why: "An earlier fix made the attack preview look up a target's Titanium/Umbrite Weapons Factory counts from that player's own server-side data instead of the attacker's own limited view of the map, so breaking an alliance (which drops shared vision) couldn't cause a false penalty anymore. But that server-side data is only kept in memory while a player is actively connected -- so previewing an attack against an opponent who happened to be offline at that moment still fell back to scanning the attacker's own limited view, reproducing the same false penalty under a different trigger.",
    changes: [
      "Attack previews against an offline opponent's territory now correctly reflect their real weapons-factory counts, instead of sometimes wrongly applying the missing-factory penalty"
    ]
  },
  {
    createdAt: 1788301428581, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.6",
    title: "3D map: frontier tint and fog-of-war are transparent again",
    why: "The previous shadow-visibility fix switched the ownership-tint overlay to a multiply blend so a tile's cast shadow shows through settled territory's tint -- but that overlay's rendering code is shared with frontier tint and both fog-of-war layers, and multiply blending always darkens the ground rather than mixing toward the tint color the way the old alpha blend did. Frontier tiles and fogged (unrevealed) tiles started reading as a heavy, near-opaque wash instead of a subtle one, and the ground under them looked darker overall.",
    changes: [
      "Frontier tint and fog-of-war are back to their original translucent look",
      "Settled/owned territory keeps the new shadow-visible-through-tint look unchanged"
    ]
  }
];
