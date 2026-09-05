// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_18: ClientChangelogEntry[] = [
  {
    createdAt: 1788207240438, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31.4",
    title: "Fixed the 3D border overlay disappearing on islands the camera isn't near",
    why: "The true-3D renderer only keeps map chunks loaded near the camera's current position, so a player-owned island elsewhere on the map has no locally-cached tile data even after it's been discovered. The border-overlay renderer treated a missing local tile the same as a genuinely fogged one, so the Aether Survey Line boundary silently vanished on every island except whichever one the camera happened to be near.",
    changes: [
      "The 3D map's border overlay (Aether Survey Line) now stays visible on previously-discovered islands even when their chunks aren't currently streamed in near the camera"
    ]
  },
  {
    createdAt: 1788283561968, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.1",
    title: "AI empires now go on a war footing under sustained attack",
    why: "AI empires only reacted to enemy or barbarian pressure by nudging a few scores -- never enough to actually stop building granaries and grabbing scattered land while a real, ongoing incursion was underway. Confirmed live: an AI empire lost dozens of tiles a day to barbarian raids while its planner kept treating every tick as business as usual.",
    changes: [
      "AI empires now recognize a sustained, land-connected threat and shift into a focused war footing -- expansion redirects toward retaking ground instead of scattering outward, non-essential building is put on hold, and attacking/fortifying get a real priority boost",
      "An ocean-separated threat (nothing reachable without crossing water) doesn't trigger this -- it still raises alarm normally, just doesn't put the whole empire on a war footing",
      "The war footing holds for a few ticks after the threat clears before easing off, so it doesn't flicker on and off with every single tile that changes hands"
    ]
  },
  {
    createdAt: 1788295630309, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "3D map shadows: lighter, visible through owned/settled tile color, and extended to more buildings",
    why: "The first shadow pass left three visible problems. The shadow itself defaulted to fully dark (three.js's shadow.intensity = 1), reading harsher than intended. The owned/settled tile color overlay used a straight alpha blend, which puts 85%/50% weight on its own flat color and only 15%/50% on the ground's real (possibly shadowed) color underneath -- so a tile's real cast shadow barely showed through the ownership tint at all. And mountains, town buildings, forts, watchtowers, and docks build their own meshes outside the shared structure-piece factory the first pass wired up, so they were skipped and kept reading as flatly lit no matter the sun's angle -- worsened by the shadow map's texel density being too coarse at typical zoom for fine building/tree detail, which read as pervasive self-shadowing acne rather than clean lighting.",
    changes: [
      "The 3D map's cast shadows are noticeably softer than before",
      "A tile's real cast shadow now visibly darkens its owned/settled color fill instead of being hidden underneath it",
      "Mountains, town buildings, forts, watchtowers, and docks now cast and receive real shadows too, matching trees and most other structures",
      "Raised the shadow map's resolution and retuned its bias to cut down on shadow-acne flicker on building/tree surfaces, which was making them look unlit even with shadows enabled"
    ]
  },
  {
    createdAt: 1788325360893, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.7",
    title: "3D map: fog-of-war is a solid dark tint again, not a washed-out one",
    why: "The previous fix reverted fog-of-war's black darkening quad to the original translucent alpha blend, which read as too washed-out/see-through against the ground's real lit-and-shadowed color -- undoing the fog effect's whole point of hiding stale, out-of-vision terrain. Frontier tint is genuinely meant to be a subtle wash and stays that way; fog-of-war is meant to read as solidly dark, which is what the multiply blend (the same one settled/owned territory uses) actually gives it.",
    changes: [
      "Fog-of-war (previously-seen but currently out-of-vision territory) is back to a solid, near-opaque dark tint instead of a washed-out translucent one"
    ]
  },
  {
    createdAt: 1788329843239, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.8",
    title: "Fixed clicking a fogged tile sometimes doing nothing",
    why: "Whether a tile counts as fogged is decided by discoveredTiles, which is restored from localStorage across a page reload -- but the actual remembered tile data (owner, terrain, structures) in state.tiles is not restored, only refetched as tiles come back into live vision. A tile fogged before the current session started therefore had no local record at all, and the click handler only opened the tile info panel when that local record existed -- so clicking it silently did nothing, with no error and no feedback.",
    changes: [
      "Clicking a fogged tile with no remembered local data now opens the tile info panel with what's actually knowable (its terrain) instead of doing nothing"
    ]
  },
  {
    createdAt: 1788331350303, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.9",
    title: "Fogged and unexplored tiles now offer Expand To, and show a Fogged/Unexplored status",
    why: "A fogged (previously-explored, currently out-of-vision) tile's menu unconditionally showed zero actions, even on ordinary claimable neutral land -- there was no way to expand toward ground you'd already seen once but had since lost vision of. An unexplored tile's menu offered a waypoint in some cases but no plain adjacent claim, and neither menu said anything about why the tile looked the way it did.",
    changes: [
      "Fogged and unexplored land tiles now offer \"Expand To\" (adjacent claim or a routed waypoint chain, same as any other neutral target) instead of no actions at all",
      "Both menus now show a status line (\"Fogged — showing last known data\" / \"Unexplored — terrain unknown\") explaining why the tile's info might be incomplete or out of date"
    ]
  },
  {
    createdAt: 1788465026903, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.01",
    title: "Aether Towers can now be switched off and back on, like any other structure",
    why: "Every Aether Tower you own occupies CRYSTAL slots, and progressively more of them per tower -- the 1st costs 1 slot, the 2nd costs 2, and so on. Economic structures have always had an Enable/Disable switch for exactly this situation, but the tower had none: the only way to stop paying its CRYSTAL bill was to demolish it and lose the build cost. The tile menu's Disable button simply wasn't there for towers.",
    changes: [
      "An owned, finished Aether Tower now has Disable / Enable actions in its tile menu",
      "A disabled tower stops occupying CRYSTAL slots, stops giving its vision bonus, and stops powering crystal abilities and Sky Docks -- the tower itself stays built and can be switched back on at any time",
      "Disabling a tower also frees the progressive CRYSTAL rank behind it, so your remaining towers get cheaper, not just fewer"
    ]
  },
  {
    createdAt: 1788536800696,
    introducedIn: "2026.09.04.1",
    title: "Defenders now see an approaching company for an incoming attack's full travel-time window",
    why: "Muster flags now have real mechanical travel time before an attack lands, but the incoming-attack skirmish animation on the defender's side still only played its normal ~3.4s approach before clashing, regardless of how long the attacker's company actually had left to march. A defender could see troops already fighting on a tile that, mechanically, hadn't been reached yet.",
    changes: [
      "An incoming attack's skirmish animation now holds its \"company approaching\" stance for the attacker's real remaining travel time instead of clashing after a fixed ~3.4s, without ever revealing the attacker's muster flag location — only the general direction was ever shown"
    ]
  },
  {
    createdAt: 1788552891612,
    introducedIn: "2026.09.04.2",
    title: "Fixed Aether Bridge rejecting every target as \"not coastal land\"",
    why: "Worldgen flips any sea tile touching land -- including diagonally -- into LAND, so genuine open sea is never orthogonally adjacent to a land tile, only diagonally. The Aether Bridge's coastal-land check (both the server's validation and the client's targeting/highlight logic) only looked at the 4 orthogonal neighbors, so it could never find a real coastal tile and rejected every target with \"target must be coastal land\".",
    changes: [
      "Aether Bridge targeting and casting now check all 8 neighboring tiles for open sea, so real coastal land is recognized again and the ability can be cast"
    ]
  },
  {
    createdAt: 1788552483010, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.12",
    title: "Muster flags now say what they're actually doing: traveling, fighting, or planning their next move",
    why: "An Advance or March flag's tile menu, HUD panel row, and on-map alert only ever said \"Advancing\"/\"Holding\" -- with no way to tell whether it was mid-fight, waiting out its auto-fire cooldown, or just idle. A March flag was worse off: it fell all the way through to the generic \"Holding\" text since only Advance was special-cased, hiding its real target and progress. The server now tracks each flag's live auto-fire status (in combat vs. cooling down, and which enemy tile it's fighting for) and syncs it down so all three surfaces show the same real story.",
    changes: [
      "Muster flags now show \"Fighting at (x, y)\" while an attack they funded is in progress, instead of just \"Advancing\"",
      "An idle Advance/March flag now shows a live \"Planning next move — Ns\" countdown to its next auto-fire search instead of no timing info at all",
      "That countdown now says why it's waiting when it can: \"No target within range\" when nothing attackable exists nearby, or \"Not enough manpower for the nearest target\" when a real target is in range but this flag can't afford to hit it yet",
      "March flags now get their own accurate status text (fighting/cooldown/target) instead of silently falling back to the generic \"Holding\" wording meant for Hold-mode flags"
    ]
  },
  {
    createdAt: 1788563281345,
    introducedIn: "2026.09.04.13",
    title: "Fixed Aether Bridge still rejecting real coastal tiles after the last fix",
    why: "The previous Aether Bridge coastal-land fix widened the check to all 8 neighbors, but the client's version of that check read terrain from terrainAt(), a purely procedural function that recomputes terrain from the world seed alone -- it has no idea about server-side overrides like carved dock channels, player-made or removed mountains, or connectivity fixes, which cluster exactly where coastlines are. So a tile that was only coastal because of one of those overrides still greyed out with \"Target must be coastal land\", even though the server's own (already-fixed) validation would have accepted it.",
    changes: [
      "Aether Bridge's tile-menu availability check and target highlighting now read a neighboring tile's real synced terrain first, falling back to the procedural guess only for tiles with no synced data, instead of trusting the procedural guess everywhere"
    ]
  },
  {
    createdAt: 1788555541310, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.13",
    title: "Fixed the daily activity digest reading much shorter than the day actually was",
    why: "Every headline was scored on a 0-100 scale, hard-clamped at 100 -- so on a genuinely big day, several unrelated metrics (a 226-tile defeat, a 301-tile war, 4,424 manpower spent attacking) all simultaneously blew past their calibration and tied at the ceiling, with only the first few in build order surviving. Worse, a specific-tile headline (Bloodiest Battle, Fiercest Fighting) was dropped whenever it named the same two players a higher-ranked headline already had, even though naming the actual location is new information, not a repeat.",
    changes: [
      "Headline scores are no longer clamped at 100, so a real outlier day ranks its headlines by how big each one actually was instead of several tying at the ceiling",
      "A headline naming a specific tile (Bloodiest Battle, Fiercest Fighting) is no longer dropped just because it shares its two players with an already-told headline -- the location itself is new information"
    ]
  },
  {
    createdAt: 1788563858436, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "The manpower panel's muster flag status now updates live while you're watching it",
    why: "A muster flag's status line (fighting, planning next move with a countdown, waiting on a target) only changed when a server tile delta happened to arrive, so a player who opened the manpower panel to watch a flag work would see the countdown text freeze in place between updates instead of ticking down, even though the flag was actively counting down toward its next action.",
    changes: [
      "The manpower panel's \"Active muster flags\" list now refreshes once a second whenever it's open and you have an Advance or March flag out, so its status text (fighting, countdown, waiting on a target) visibly keeps pace instead of only updating on the next server push"
    ]
  }
];
