// Older client-changelog entries, split out of client-changelog-data-earlier-2.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep the other
// changelog data files under their line cap when the trailing week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in the other three files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_3: ClientChangelogEntry[] = [
  {
    createdAt: 1787682505307, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.3",
    title: "Fixed sea tiles rendering solid black from underneath",
    why: "The 3D water mesh only had a front face wound (normal pointing up) and the material never set a two-sided render mode, so any camera angle that caught the underside of the water surface -- looking up from below water level, or a steep enough grazing angle -- rendered nothing at all, showing empty background through the hole instead of water.",
    changes: [
      "Water tiles now render from both sides, so the sea never shows as a black hole regardless of camera angle."
    ]
  },
  {
    createdAt: 1787665177074, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.2",
    title: "Fixed missing ownership colour on settled coastal hills",
    why: "A shared map-corner vertex touching both sea and land was always flattened to beach height, even when the land side was a hill. That sank the hill's draped ownership tint (and its gridlines) below the visible dome surface, so a settled hill right next to the coast -- exactly where FISH resources spawn -- looked uncovered even though it was fully owned.",
    changes: [
      "Coastal hill tiles now keep their ownership colour and gridlines visible; the map corner tapers to the hill's own edge height instead of dropping to beach level."
    ]
  },
  {
    createdAt: 1787837642949, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27.4",
    title: "Fixed an expand/attack in progress across a reconnect losing its result",
    why: "If you closed the game (or it dropped connection) while an Expand or Attack was still resolving, reopening it lost track of that action entirely: the server still finished it correctly, but the fresh page had no memory of having started it, so the confirmation and claim animation never showed and it looked like nothing had happened -- or like a queued waypoint chain behind it had simply vanished.",
    changes: [
      "Reconnecting while an Expand or Attack is still resolving now correctly shows its result (claim animation, success message) instead of silently dropping it."
    ]
  },
  {
    createdAt: 1787584599966, // frozen from `node -e "console.log(Date.now())"`, one past the prior latest entry to avoid a createdAt collision
    introducedIn: "2026.08.24.6",
    title: "\"Expand To\" no longer shows \"0 gold\" when expanding costs no gold",
    why: "The multi-step Expand To cost line always showed a gold figure even when the plan was pure EXPAND steps, which cost manpower only. That made it look like the action was free (misleading) or like gold was being charged (confusing) instead of simply not being part of the cost.",
    changes: [
      "The Expand To cost summary now omits the gold amount entirely when the plan costs 0 gold, showing only manpower and time."
    ]
  },
  {
    createdAt: 1787584599965, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.24.5",
    title: "Fixed frontier tiles auto-settling on undiscovered resources",
    why: "Auto-settle was supposed to skip a resource tile until you'd actually revealed it (scouted it into your fog-of-war coverage), but a refactor had silently dropped that check, so a frontier tile could auto-settle the instant it became eligible even if you hadn't seen what was on it yet.",
    changes: [
      "Auto-settle no longer claims a frontier tile with a resource on it until that resource has actually been revealed to you. Town, dock, and town-supported frontier tiles are unaffected since those were always visible to their owner."
    ]
  },
  {
    createdAt: 1787572138647, // frozen from `node -e "console.log(Date.now())"`, one past the prior latest entry to avoid a createdAt collision
    introducedIn: "2026.08.24.4",
    title: "Easier to find food",
    why: "FARM and FISH clusters were rare enough (52 of each, scattered across the whole map) that players crossing open land or coastline could go a long way without spotting any food.",
    changes: [
      "New small single-tile FARM deposits now appear in each of the 4 directions around most farm clusters, 7-11 tiles out, so open land near a farm cluster has more food to find. There are now fewer, but larger-footprint, farm clusters overall to keep the total farmland roughly in balance.",
      "New small single-tile FISH deposits now appear on either side of existing fish clusters, roughly 10 tiles out along the coast, so a coastline with fish has a couple of easier follow-up spots nearby. Fish clusters themselves are slightly smaller to keep the total fishing grounds unchanged."
    ]
  },
  {
    createdAt: 1787553808483, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.24.2",
    title: "Settle Land now shows its manpower cost, and stays hidden until you actually need it",
    why: "Settle Land and Settle Connected only showed their gold cost, hiding the manpower they actually spend, and were shown from turn one even though manual settling has nothing to offer that early -- it's really only useful once you have a town and food running, for cheap defense, connecting towns, or consolidating territory. New players kept settling exposed frontier tiles in the opening minutes for no benefit, burning manpower they needed elsewhere.",
    changes: [
      "The manpower cost of settling is now shown on Settle Connected's total cost line -- previously only the gold cost was shown, so it looked cheaper than it was. The multi-select bulk \"Settle Land\" button (which claims unowned land) now correctly shows its own claim cost instead of the settle cost.",
      "Settle Land and Settle Connected are now hidden from the tile menu until you have a settled town and a settled food tile (farm or fish), and appear at the very bottom of the actions list once they do."
    ]
  },
  {
    createdAt: 1787520325005, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.9",
    title: "Rivers no longer render through unexplored fog",
    why: "Decorative rivers were drawn as one continuous overlay that only culled by camera distance, with no idea what the player had actually explored -- so a river's path stayed visible cutting through black, unexplored tiles instead of disappearing into the fog like the surrounding terrain.",
    changes: [
      "River segments now only render where both ends sit on a tile you've explored or previously seen, matching the terrain's own fog-of-war."
    ]
  },
  {
    createdAt: 1787519694045, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.8",
    title: "Trimmed two noisy activity feed messages",
    why: "\"Unlocking: X\" and \"could not start and was removed from queue\" fired on routine, expected actions and just added clutter to the feed without telling you anything new.",
    changes: [
      "Choosing a tech no longer posts an \"Unlocking: X\" line to the activity feed.",
      "A queued build/settlement that fails to start no longer posts a \"could not start and was removed from queue\" line to the activity feed."
    ]
  },
  {
    createdAt: 1787518529221, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.6",
    title: "New town theme sound",
    why: "The old town location theme was swapped out for a new one-shot cue.",
    changes: ["Looking at a town now plays a new, updated town theme sound instead of the old one."]
  },
  {
    createdAt: 1787501551525, // frozen just after this file's prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.23.5",
    title: "AI empires no longer play ahead during the season lobby countdown",
    why: "Locking new human players out of a season until the lobby countdown finished didn't also stop AI empires from acting -- they kept building, expanding, and fighting during the countdown, so by the time human players were let in the AI had a head start nobody could see coming.",
    changes: [
      "AI empires now stay locked out of taking any actions during the lobby countdown, just like new human players, until the season actually starts."
    ]
  },
  {
    createdAt: 1787501551526, // frozen just after the entry above
    introducedIn: "2026.08.21",
    title: "Village smoke and capital banners are now animated on the GPU instead of the CPU",
    why: "Village smoke puffs, captured-town smoke columns, and capital banner positions were recomputed and re-uploaded to the GPU (bufferSubData) every single frame for every visible instance — up to ~7,000 combined smoke puffs — regardless of whether the camera or game state changed at all. A CPU trace from a live session showed WebGL buffer uploads as the dominant per-frame cost, correlating with a sustained ~11-12fps. The rise/drift/scale/fade animation now runs entirely in a GPU vertex shader driven by a single time value; the CPU only writes each puff's base position once, when villages or captured towns actually change (not every frame). Capital banner positions — which never moved — were also being needlessly rewritten every frame; they're now set once too. Visually identical to before.",
    changes: [
      "No visible change — this is a performance fix for the 3D map's frame rate. Village smoke, captured-town smoke, and capital banners render identically, just far cheaper per frame."
    ]
  },
];
