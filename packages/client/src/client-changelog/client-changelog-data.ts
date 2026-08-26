// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
import { CLIENT_CHANGELOG_ENTRIES_EARLIER_2 } from "./client-changelog-data-earlier-2.js";
export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use a frozen literal (check:client-changelog rejects Date.now()).
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};
// Add a new entry for every user-facing client release; client-changelog.ts sorts by createdAt.
const RECENT_CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1787769789241, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.8",
    title: "Fixed a captured settlement appearing to remain intact after capture",
    why: "When an ATTACK captured an enemy's SETTLEMENT-tier town, the simulation correctly razed it, but the wire delta cleared the town by setting townJson to undefined rather than an explicit empty value. JSON.stringify drops object keys whose value is undefined, so the clear signal never reached the client -- the client's merge logic treats an absent townJson key as \"unchanged\" (by design, to avoid a different class of stale-data bug), so it kept rendering the old town as if capture had done nothing.",
    changes: [
      "A captured settlement now visibly disappears for everyone immediately on capture, instead of appearing to survive until an unrelated update happened to touch the tile."
    ]
  },
  {
    createdAt: 1787768869848, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.8",
    title: "Waterworks no longer claims a food-production boost it doesn't have",
    why: "Waterworks's description said it boosts every nearby Farmstead's food production by +100%, the same dead per-tile production claim already corrected for Farmstead, Mine, and Umbrite Rig -- the resource-slot rewrite retired per-tile food production, so the multiplier never applies to anything.",
    changes: [
      "Waterworks's description, tech-tree copy (Hydraulic Works), and modifier chip now only show its real effect: +2 FOOD slots for every Farmstead within 10 tiles"
    ]
  },
  {
    createdAt: 1787752754484, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Fixed food/crystal (and other resource slot) totals getting stuck wrong until you changed a tile",
    why: "Resource slot totals and dormancy (what shows a structure as short on food/crystal/titanium/umbrite and disables further builds) are cached per player and only recomputed when a tile of yours changes. If that cache ever ended up wrong without a tile change to invalidate it, the wrong totals -- and any resulting build lockout -- stuck around indefinitely; a client refresh couldn't fix it since the bad value lived server-side, and the only known workaround was forcing a tile change yourself (e.g. abandoning a tile).",
    changes: [
      "Connecting (or reconnecting) now forces one fresh resource-slot supply/demand/dormancy recompute straight from your live territory, bypassing the cache entirely. This self-heals a stuck-wrong total without requiring any tile change, and runs once per connect rather than on any repeated or per-check basis, so it adds no cost during normal play."
    ]
  },
  {
    createdAt: 1787767880392, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.5",
    title: "Farmstead no longer claims a food-production boost it doesn't have",
    why: "Farmstead's description said it boosts farm-tile food production by 50%, matching Mine and Umbrite Rig's identical (and already-corrected) dead production claim -- the resource-slot rewrite retired per-tile food production entirely, and the one function that would compute Farmstead's 50% bonus has no callers anywhere in the code.",
    changes: [
      "Farmstead's description, tech-tree copy, and modifier chip now only show its real effect: +2 FOOD slots on a farm tile"
    ]
  },
  {
    createdAt: 1787765310135, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Fixed: queued Expand/Attack orders now execute automatically",
    why: "The waypoint/expand queue only stored your queued targets on the server -- it never actually walked the route for you while you were offline, so queued orders just sat there until you reopened the game and your client resumed dispatching them itself.",
    changes: [
      "A queued Expand/Attack now fires automatically as soon as it's your turn in the queue, including while you're completely offline.",
      "A queued target that's no longer valid by the time it comes up (already taken, no longer reachable, etc.) is skipped instead of stalling the rest of your queue."
    ]
  },
  {
    createdAt: 1787755800000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.7",
    title: "Fixed Crystal staying hidden on tiles you could already see when Aetheric Resonance finished",
    why: "Researching a resource-revealing tech only recomputed vision radius, not the resource data of tiles already inside your vision. Since the crystal reveal only rode along on a fresh tile delta, a crystal tile you could already see stayed masked forever once Aetheric Resonance completed -- nothing ever mutated that tile again to trigger a resend, and even a fresh login pulled the same stale masked state.",
    changes: [
      "Completing a tech that reveals a resource (Aetheric Resonance/Crystal, Masonry/Titanium, Leatherworking/Umbrite) now re-sends every already-visible tile of that resource type, so it shows up immediately instead of only on tiles you scout afterward."
    ]
  },
  {
    createdAt: 1787765177459, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.7",
    title: "Fixed \"Get Rally Link\" flashing a sign-in prompt for already-signed-in players",
    why: "The button did a full page navigation to /rally/new, which reloaded the whole client and restarted Firebase Auth from scratch. The rally panel tried to mint a link before auth finished rehydrating, so it briefly showed \"Sign in, then this page will create your rally link\" even for players who were already signed in.",
    changes: [
      "Get Rally Link now opens the rally panel in place, without reloading the app, so already-signed-in players go straight to a minted link instead of seeing a sign-in flash.",
      "Fixed the rally panel's close (×) icon rendering off-center in its button."
    ]
  },
  {
    createdAt: 1787765177460, // frozen from `node -e "console.log(Date.now())"`, +1ms to avoid a collision with the entry above
    introducedIn: "2026.08.26.7",
    title: "Fixed a rally invite link covering the sign-in button",
    why: "Opening a rally invite link (/r/<code>) while signed out showed a floating \"Join a rally\" card on top of the sign-in screen. #auth-overlay lives inside #hud, which is position:fixed with z-index:auto and forms its own stacking context, so the invite card's z-index (29, meant to sit below the overlay's 30) was compared against #hud as a whole instead -- the card always painted on top, right over the Continue with Google button.",
    changes: [
      "The rally invite message now appears as a small banner inside the sign-in card itself instead of a separate floating popup, so it never blocks the sign-in buttons."
    ]
  },
  {
    createdAt: 1787755721503, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.6",
    title: "Attack alerts now show the attacker's real display name",
    why: "Attack alerts (in-app and email) were built from the simulation's own player record, which is created equal to the player's raw account ID and never learns their actual display name -- so an attacker with a display name set still showed up as an unreadable string like \"VK5iriJAhickNf9ArrRweUDnq1W2\" instead of their chosen name.",
    changes: [
      "Attack alerts now look up the attacker's live profile name (the same source the leaderboard already uses) before falling back to a short anonymized empire label (e.g. \"Empire A1B2C3\") for players who haven't set one.",
      "The attack alert email has also been restyled to match the season-start email's card design instead of being plain unstyled text."
    ]
  },
  {
    createdAt: 1787754175140, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.5",
    title: "Pulsing badge on the Allies tab for pending alliance/truce requests",
    why: "Incoming alliance and truce requests from other players had no indicator on the Ally tab icon, so they could sit unnoticed until you happened to open the panel.",
    changes: [
      "The Ally tab icon now shows a pulsing badge with a count when you have pending incoming alliance or truce requests."
    ]
  },
  {
    createdAt: 1787692499340, // frozen from a live Date.now() call
    introducedIn: "2026.08.25.8",
    title: "AI auto-settle now respects reach too, and losing reach unsettles ground you can no longer defend",
    why: "The client's auto-fill queue was already fixed to stop settling out-of-reach resource tiles, but AI empires' own auto-settle driver -- and the live queue emitted to a connected human player -- still turned any owned frontier resource/support tile into a town regardless of reach. Separately, losing or disabling the last beacon/outpost/fort covering a tile left that ground permanently claimed even once nothing defended it, since the reach border only ever shrank when a rival actively contested it.",
    changes: [
      "AI empires' auto-settle, and the live auto-settlement queue, now skip any resource or plain-support frontier tile that's outside the owner's reach border. A captured town or dock still auto-settles regardless of reach, same as before -- it has no reach of its own to grant until settled.",
      "A settled tile that falls entirely outside anyone's reach (its last covering beacon/outpost/fort is lost or disabled, and no rival covers it either) now reverts to frontier, playing the existing unsettle collapse effect. This applies to the structure's own tile too, if it was the sole anchor holding it -- a fully isolated outpost with nothing else nearby can be lost for good this way; extend reach back over it first (another anchor, or expanding in from adjacent territory) before it can be settled again."
    ]
  },
  {
    createdAt: 1787726484063, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "New player and respawn placements now draw from a precomputed, equal-opportunity spawn map",
    why: "Spawn placement previously ran a fresh random search per player against the live map, so two players joining minutes apart could land with very different access to nearby food and towns purely by luck of that search. Worldgen now precomputes a roster of candidate spawn sites up front, all drawn from the same amenity tier and spread evenly across the map, so every new empire and every respawn starts on comparably fair footing.",
    changes: [
      "Worldgen now precomputes a roster of up to 50 candidate spawn sites, spread evenly across the map instead of clustering, and prioritized so every site with both a town and food nearby is used before a lesser site is ever added.",
      "New players and eliminated players respawning now draw from this roster first, falling back to the previous random search only once it's exhausted.",
      "Joining via a friend's rally link now also draws from that same precomputed roster first, picking whichever site is closest to the inviting player, before falling back to the random search when every site nearby is already taken or too close to another empire.",
      "Worldgen now regenerates the entire map with a new seed (same as it already does for a bad island distribution or a bland map) if the candidate map can't secure a full 50-site roster, instead of shipping a season where late joiners are more likely to fall back to the plain random search from the start."
    ]
  },
  {
    createdAt: 1787739722417, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Fixed the Founding Engineer tag matching by display name instead of a stable id",
    why: "The Founding Engineer badge matched on display name (case-insensitive), so it would disappear if that player renamed and could be picked up by anyone else who renamed to the same string. The tile detail check also skipped the ally check's sea/coastal-sea and self-tile guard, so it could show up next to the generic \"Open sea\"/\"Crossing route\" text on a tile they owned.",
    changes: [
      "The Founding Engineer badge now matches on the player's stable id everywhere it's shown (lobby roster, leaderboard, tile detail), and no longer appears on sea or coastal-sea tiles."
    ]
  },
  {
    createdAt: 1787734461399, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Allies can now share dock-network access",
    why: "Docks let you cross open water, but only from a dock you personally owned -- so an ally holding the far end of a shared shipping lane didn't help you reach it, even though your empire already had a foothold somewhere in that same connected network of docks.",
    changes: [
      "EXPAND and ATTACK can now launch from an allied dock, as long as you control at least one other dock in that dock's connected network"
    ]
  },
  {
    createdAt: 1787734129392, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Added a Founding Engineer tag",
    why: "A small, fixed set of early contributors didn't have any way to be recognized in the game's social UI.",
    changes: [
      "Founding Engineer players now show a gold name and a top-hat tag next to their name in the season lobby roster, the tile detail owner label, and the leaderboard"
    ]
  },
  {
    createdAt: 1787733981707, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.4",
    title: "Aegis Dome shield radius reduced to 25 tiles",
    why: "The Aegis Dome's protection radius was 30 tiles in code while the build-menu description had always said 25 -- the two disagreed, and 25 is the intended number going forward.",
    changes: ["Aegis Dome (and its Aegis Lock) now protects a 25-tile radius, down from 30"]
  },
  {
    createdAt: 1787733981706, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.3",
    title: "Corrected several building descriptions that no longer matched their real effects",
    why: "An audit of every structure's build-menu and tech-tree copy against the actual simulation code turned up several descriptions left over from before the manpower-economy rewrite (§5), still advertising numbers or mechanics the current code doesn't implement.",
    changes: [
      "Astral Dock's satellite launch is now correctly described as free (it always was in code; the old copy claimed a 1,000 gold cost that was never actually charged)",
      "Harbor Exchange's per-dock income is now correctly shown as +5 gold/day (was shown as +1,440 gold/day -- a 288x display error)",
      "Trade Nexus's connected-town bonus now shows the real stepped +50%/+40%/+30% ladder instead of a flat, fictional +25%",
      "Rail Depot's description no longer claims it auto-settles frontier tiles or grants connected-town income points -- neither was ever implemented",
      "Ministry Hall (Governor's Office) and Seed Granary no longer claim a food-upkeep discount that was never implemented; Ministry Hall's real effect (reducing a nearby town's FOOD slot demand by its tier step) is unchanged and still shown",
      "Mine and Umbrite Rig no longer claim a +50% production boost or flat resource caps retired by the resource-slot rewrite -- both now correctly show their real +1 resource-slot effect",
      "Umbrite Works, Titanium Works, and Aether Condenser (and their Advanced tiers) no longer claim a daily resource-production rate in Refine mode that the economy no longer produces -- Refine mode is now correctly described as supplying +1 resource slot; Sell off mode's numbers were already accurate and are unchanged"
    ]
  },
  {
    createdAt: 1787731482829, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Agrarian Works now also boosts your fishing grounds",
    why: "Researching Agrarian Works only ever unlocked the Farmstead, which has no effect on fish tiles at all -- fish-heavy empires got nothing out of the tech beyond an economy-branch checkbox.",
    changes: [
      "Agrarian Works now adds +1 FOOD slot on every owned fish tile, on top of unlocking the Farmstead",
      "This is a flat tech bonus, independent of any structure -- it applies to bare fish tiles too, not just ones with a Farmstead built on them"
    ]
  },
  {
    createdAt: 1787724124671, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Frontier tiles no longer decay while sitting inside anyone's live reach",
    why: "Out-of-reach frontier decay only checked reach coverage at the moment a tile was claimed. If another player's town/outpost reach later grew to cover that ground, the original claim's decay timer kept counting down regardless, so tiles that were clearly inside someone's live border still got auto-cleared to neutral.",
    changes: [
      "Re-checks reach coverage at the moment a frontier tile's decay timer would fire, not just at claim time",
      "A tile inside any player's live reach -- the owner's own or another player's -- has its decay timer cleared instead of expiring"
    ]
  },
  {
    createdAt: 1787724118006, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Rally-linked players now spawn near a real foothold, not just the nearest empty tile",
    why: "Joining via a friend's rally link placed you on whichever open tile happened to be closest to their anchor, even a barren one with no town or food nearby -- while a normal spawn always looked for a town and food within reach.",
    changes: [
      "Rally spawns now search outward from the anchor for a spot with both a town and food nearby before falling back to a town-only, then food-only, then any-open-tile spot, all still within the rally radius"
    ]
  },
  {
    createdAt: 1787692481411, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.8",
    title: "Gave the \"join now\" season prompt a real intro instead of a bare confirmation dialog",
    why: "The plain join-season overlay (season already live, player just hasn't clicked join yet) read as a placeholder-y \"Join Season season-23?\" dialog with a static \"Ready\" dial that did nothing -- no sense of occasion for what's actually your empire's founding moment.",
    changes: [
      "Replaced the title/summary with narrative flavor text introducing the season",
      "Removed the static \"Ready\" dial and turned the confirm button itself into the focal call-to-action, relabeled \"Let's go!\""
    ]
  },
  {
    createdAt: 1787689447704, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.7",
    title: "Fixed flickering at the coastline where the water and land skirts overlapped",
    why: "The water skirt wall added in 2026.08.25.5/.6 drew a wall on all 4 sides of every exposed water tile, including north/east/west edges that sat right where the land's own coastal skirt wall already runs. Two near-coplanar unlit walls animating independently z-fought against each other every frame, flickering.",
    changes: [
      "The water skirt now only draws its south-facing edge (the side that actually faces the camera at the default view angle), leaving the land skirt to cover the other three sides instead of overlapping it."
    ]
  },
  {
    createdAt: 1787688556298, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.5",
    title: "Hid the redundant \"0 gold\" in the Build Relay Beacon action cost",
    why: "The Build Relay Beacon action's cost string always prepended the gold cost, even when expand + settle + build all cost 0 gold, so the Actions tab showed a confusing \"0 gold, N m.p. ...\" line.",
    changes: [
      "The Build Relay Beacon action's cost text now omits the gold segment entirely when the gold cost is 0."
    ]
  },
  {
    createdAt: 1787688715010, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Fixed the water skirt wall leaving a gap at wave crests",
    why: "The water skirt wall added moments earlier (2026.08.25.5) closed the black gap under coastal sea tiles, but its top edge was drawn once and never touched again, while the water surface itself bobs up and down every frame with the wave animation. Whenever the wave lifted the surface above the skirt's static top, the same black gap reappeared.",
    changes: [
      "The water skirt's top edge now rides the same wave animation as the surface, so it stays flush with the water at every frame instead of only when the sea happens to be at rest."
    ]
  },
  {
    createdAt: 1787689171531, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Fixed auto-settle trying to build on resource tiles outside your reach",
    why: "The auto-settle queue included every owned frontier tile with a resource, town, or dock without checking reach, so a plain resource tile (which generates no reach of its own) claimed outside your reach border kept getting re-queued and rejected with an OUT_OF_REACH error.",
    changes: ["Auto-settle no longer queues frontier tiles that are currently outside your reach border."]
  },
  {
    createdAt: 1787691972634, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Town population bar now shows progress toward the next tier",
    why: "The town overview's population bar showed current population against the town's absolute population cap, which barely moved even as a town grew and gave no sense of how close it was to upgrading tiers.",
    changes: [
      "The population bar and its number now track progress toward the next population tier (e.g. Town → City) instead of the absolute population cap, and turns green once that tier's threshold is reached."
    ]
  },
  {
    createdAt: 1787688074263, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.5",
    title: "Fixed black artifacts under coastal sea tiles",
    why: "The water surface is a flat, zero-thickness sheet with no underside geometry of its own -- it relied entirely on the neighboring land's own coastal skirt wall to hide the void beneath it. Anywhere water bordered non-water without a drawn land tile covering that edge this frame (open sea, a fog/window boundary, etc.), there was nothing there, so a grazing or below-water view saw straight through to empty background.",
    changes: [
      "Water tiles now get their own skirt wall along every edge that doesn't border another water tile, so the sea never shows a black gap underneath regardless of camera angle."
    ]
  },
  {
    createdAt: 1787687420759, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Reverted the crisp border-ribbon prototype on the 3D ownership overlay",
    why: "The prototype border ribbon along exposed territory edges (#1474) didn't read well in practice -- pulled back out to the flat fill-tint look while a better edge treatment is worked out.",
    changes: [
      "3D territory tiles no longer draw a bright border ribbon along exposed edges; back to the fill-only look."
    ]
  },
  {
    createdAt: 1787688467708, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.6",
    title: "Fixed structure builds (like Relay Beacon) appearing stuck after expand+settle+build",
    why: "Building a structure on a not-yet-settled frontier tile makes the client send a SETTLE command directly while the server independently auto-enqueues its own SETTLE step for the same tile, so whichever arrives second is rejected as a duplicate. The client's recovery logic for that expected rejection compared against a slightly wrong error string, so it never matched -- instead of quietly resuming, the client wiped its local settlement/build tracking and stopped refreshing, even though the server had already settled the tile and started building.",
    changes: [
      "The client now correctly recognizes a duplicate-settle rejection and resumes tracking instead of abandoning the tile, so builds like Relay Beacon started via expand+settle+build no longer appear stuck client-side while they're actually progressing on the server."
    ]
  },
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
    createdAt: 1787682600000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.4",
    title: "Fixed the out-of-reach decay pulse jumping every time you panned the camera",
    why: "The amber/white frontier-decay countdown pulse was baked into the ownership overlay's mesh colors inside the same rebuild that also fires on every camera pan or zoom (not just on actual game-state changes), sampling the wall clock fresh each time -- so panning the map made the pulse visibly jump or restart instead of animating smoothly.",
    changes: [
      "The decay pulse now animates from a per-frame update independent of camera movement, the same pattern already used for the reach-border pylon animation -- it only reacts to the tile's actual decay state, never to panning or zooming."
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
    createdAt: 1787572037117, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.24.2",
    title: "Removed the misleading \"+0 gold cap\" from the Mintworks build description",
    why: "The Build Mintworks panel and its tile-menu detail text both tacked on a \"+N gold cap\" figure computed from the target town's current gold/min, which is 0 (or otherwise unrelated to what Mintworks actually grants) in the normal build-preview case, showing up as a nonsensical \"+0 gold cap\" and implying Mintworks adds a flat cap it doesn't.",
    changes: [
      "Build Mintworks descriptions now only show the actual +town gold production % bonus, dropping the bogus gold cap figure."
    ]
  },
  {
    createdAt: 1787548762402, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.24.1",
    title: "Fixed border sometimes not expanding right after a Relay Beacon finished",
    why: "A Relay Beacon (and other structures) finish building on their own timer rather than as part of a normal command, and the server-authoritative border push only used to fire alongside a command being processed. So the border update sat ready but unsent until some other action happened to trigger it -- which could take a while, and looked like lag.",
    changes: [
      "Finishing a Relay Beacon (or any structure that changes your reach) now pushes the updated border to your client immediately, instead of waiting on an unrelated command to trigger the push."
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
  {
    createdAt: 1787489000059, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.3",
    title: "Fixed camera not recentering when you spawn mid-session",
    why: "Joining a season while already connected (rather than on a fresh page load) spawned your starting territory, but the camera stayed wherever you'd been panning beforehand and never moved to your new settlement -- and since the camera controls which map area loads, you could end up looking at empty, unloaded darkness with no way to find your own empire.",
    changes: [
      "Joining a season mid-session now recenters the camera on your new settlement as soon as it spawns.",
      "The map around your new settlement now loads immediately instead of requiring a manual pan to trigger it.",
      "The stale pre-spawn camera position is no longer saved for next time you load the game."
    ]
  },
  {
    createdAt: 1787501551524, // frozen one ms after the incoming "Lowered the season player cap to 50" entry
    introducedIn: "2026.08.23.4",
    title: "\"Maybe your empire is in ruins\" no longer fires while you're still waiting in the pre-game lobby, and the lobby fits mobile screens properly",
    why: "Income is naturally zero before a world has started, but the respawn prompt only checked income, so everyone waiting for a season to begin got told their empire might be in ruins. Separately, on narrow phone screens the lobby's roster/ID text could get clipped at the edge of the screen and the \"Join the Discord\" button wrapped its label onto two lines.",
    changes: [
      "The respawn prompt now also checks that you're not still waiting to join a season before suggesting a respawn.",
      "The pre-game lobby now reclaims horizontal space on narrow phones and stacks its action buttons full-width, so \"Join the Discord\" and roster/ID rows no longer wrap or run off the edge of the screen."
    ]
  },
  {
    createdAt: 1787501551523, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.4",
    title: "Lowered the season player cap to 50",
    why: "The lobby was hitting the prior 120-player cap; capping seasons at 50 keeps them a manageable size.",
    changes: [
      "New seasons now stop admitting new players once 50 human players have joined, down from 120."
    ]
  },
  {
    createdAt: 1787749806338, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "AI empires can now unblock growth when out of FOOD slots",
    why: "When an AI ran completely out of FOOD slots with no Farmstead/Waterworks/Granary build available to grow more, it had no way out -- every FOOD-costing build (including a new Relay Beacon, which is the AI's only path to claim more farmland) stayed permanently illegal, so a starved AI empire would just get stuck forever instead of expanding its way out of the shortage.",
    changes: [
      "An AI empire that's fully out of FOOD slots, with no direct way to grow more, will now disable one of its own Relay Beacons that isn't covering any resources to free up the slot for further growth.",
      "This is always a reversible disable, never a demolition -- the building stays intact and can be re-enabled once FOOD has headroom again."
    ]
  },
  {
    createdAt: 1787766405640, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Settle now works on a captured town or dock outside your reach",
    why: "A captured town or dock frontier tile (e.g. taken by Attack, which isn't reach-gated) could sit outside your reach border and keep getting rejected with \"tile is outside your reach\" every time Settle was attempted, even though settling it is exactly what would give it its own reach in the first place -- a Catch-22 that made some captured towns/docks permanently unsettleable.",
    changes: [
      "Settle no longer requires a captured town or dock tile to already be inside your reach -- only plain resource/support frontier tiles still need that."
    ]
  },
  {
    createdAt: 1787766488424, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "Incubation Engine now grants ongoing population growth, not just a one-time burst",
    why: "The Incubation Engine (Granary) only ever paid off once, on the tick it finished building, then sat there doing nothing for the rest of the game -- a Seed Granary's ongoing growth boost made the base building feel like a dead end once its instant burst was spent.",
    changes: [
      "A completed Incubation Engine now also grants a flat +10% ongoing population growth rate for its town, on top of the existing +10,000 instant population burst on completion.",
      "A Seed Granary's own buffed-radius growth bonus still stacks on top of this when it applies."
    ]
  },
  {
    createdAt: 1787769924625, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.3",
    title: "Aether Condensers can now stack on the same town",
    why: "Every other support-ring economic building in a family (Umbrite Works, Titanium Works, etc.) was already unlimited empire-wide with only a one-per-town cap forcing you to found more towns for more supply -- but the Aether Condenser's rejection also surfaced the raw internal name (\"crystal synthesizer\") instead of its real name, and its one-per-town cap didn't need to be as tight since it has no network-wide effect to worry about stacking.",
    changes: [
      "A town can now host more than one Aether Condenser (or Advanced Aether Condenser), limited only by its open support tiles, instead of exactly one.",
      "The \"town already has...\" rejection now says \"Aether Condenser\" instead of the internal \"crystal synthesizer\" name."
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2
];
