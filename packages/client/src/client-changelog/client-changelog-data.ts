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
    createdAt: 1787487792786, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.3",
    title: "Punched up the season-lobby copy",
    why: "The 'Season starts soon' text was accurate but flat -- it read like a disclaimer instead of hyping up the moment everyone's about to launch together.",
    changes: [
      "The join-season overlay now reads \"Same starting line for everyone -- the whole season kicks off in one shot, no head starts,\" with the timezone caveat kept as a short aside."
    ]
  },
  {
    createdAt: 1787485929859, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.3",
    title: "Fixed the name/color picker not showing for new players joining a season",
    why: "The season lobby's full-screen treatment hides every other overlay on screen while it's up -- including the name/color setup screen, which needs to run first for a brand-new player. A new player hitting a pending or newly-started season had no screen left to pick a name and color on, so it silently never appeared.",
    changes: [
      "The season lobby now waits for name/color setup to finish before taking over the screen, instead of hiding it."
    ]
  },
  {
    createdAt: 1787484620520, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.2",
    title: "Fixed the season lobby's cog vibrating instead of turning, and the invite button appearing to do nothing",
    why: "The season lobby overlay rebuilt its entire DOM on every render pass, most of which fire from ordinary background traffic unrelated to the lobby itself -- that reset the brass cog's CSS animation before it ever completed a visible rotation (looked like vibrating), and wiped out the invite button's \"Copied!\" confirmation within milliseconds of clicking it, making the button look broken even though the copy succeeded. Separately, reloading the page while waiting in the lobby dropped you back to a plain \"Join Season?\" prompt with an empty player list instead of returning you straight to the countdown you were already in.",
    changes: [
      "The season lobby's cog now spins smoothly, and the countdown/roster no longer flicker on every background update.",
      "The \"Bring a friend\" button's \"Copied!\" confirmation is now visible long enough to actually see it.",
      "Reloading the page (or reconnecting) while waiting in the pending-season lobby now returns you straight to the countdown with the live player count and roster, instead of showing an empty \"Join Season?\" prompt first."
    ]
  },
  {
    createdAt: 1787476076398, // frozen just after this file's prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.23.2",
    title: "Expand is gated to your reach again, with a new way to reach an out-of-reach rival",
    why: "Expanding onto land outside your reach border used to succeed, then quietly go nowhere -- you couldn't settle it, build on it, or hold it against a rival's growing border, so it just sat there looking claimed while doing nothing. That was confusing without adding anything you could actually use it for.",
    changes: [
      "Expand now requires the target tile to be inside your reach border, same as Settle already did.",
      "The one exception: if a rival's reach border touches yours, you can still expand into their reach right at that contact point -- opening a legal Attack origin against them even if none of your other territory reaches that far.",
      "Where two empires' reach borders touch, the border pylons and connecting lines now blend into a shared translucent beam instead of showing one owner's solid color, with faint drifting dust in both empires' colors passing through it."
    ]
  },
  {
    createdAt: 1787431431635, // frozen from a live Date.now() call
    introducedIn: "2026.08.22.12",
    title: "Fixed rivers clipping through hills",
    why: "River ribbons rendered at the flat ground elevation, ignoring the raised dome mesh used for hill tiles, so a river crossing a hill looked like jagged glued-together rectangles instead of a smooth ribbon.",
    changes: ["Rivers now render above the hill dome wherever their path crosses a hills tile."]
  },
  {
    createdAt: 1787462871189, // 2026.08.23.05 — frozen from a live Date.now() call
    introducedIn: "2026.08.23.05",
    title: "Turned off rivers in new map generation",
    why: "Generated rivers didn't fully work -- they could cut land in ways that broke territory shapes and pathing, so we're disabling them until the generator is fixed.",
    changes: [
      "New maps no longer generate rivers; existing maps are unaffected."
    ]
  },
  {
    createdAt: 1787475367888, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Corrected the lobby's timezone claim",
    why: "The join-season overlay said a synchronized start means \"the first move isn't decided by timezone\" -- that's wrong, a shared start time doesn't erase timezone effects on when players are actually online. What it actually guarantees is that everyone gets the same starting line, not the same impact from timezone.",
    changes: [
      "The lobby's \"Season starts soon\" text now says a synchronized start gives everyone the same chance from the same starting line, rather than incorrectly claiming timezone has no effect on the first move."
    ]
  },
  {
    createdAt: 1787475219678, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Rally link dialog can now be dismissed, and rally links are reachable from Settings",
    why: "The rally-create and rally-invite dialogs had no way to close once you'd copied the link -- the only way out was navigating away entirely. And minting a rally link required knowing the /rally/new URL by hand.",
    changes: [
      "The rally link dialog now has a close (×) button in the top-right corner that dismisses it and clears the rally URL from the address bar.",
      "Signed-in players can now open \"Get Rally Link\" from Settings → Gameplay instead of typing /rally/new."
    ]
  },
  {
    createdAt: 1787472290597, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.1",
    title: "Added a Slot Sources breakdown to the Economy panel for Food, Titanium, Crystal, and Umbrite",
    why: "The Economy sidebar's slot-based resources only showed \"Occupied by\" (who's using your slots), with no way to see where the slot capacity itself came from -- unlike GOLD, which already lists its Income Sources.",
    changes: [
      "The Economy panel's detail card for FOOD/TITANIUM/CRYSTAL/UMBRITE now has a \"Slot Sources\" column listing which tiles and boost structures (Farmstead, Mine, Umbrite Rig, Waterworks/Foundry radius bonuses, active synthesizers) are contributing slot capacity, alongside the existing \"Occupied by\" column."
    ]
  },
  {
    createdAt: 1787474961956, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Higher starting manpower for new capitals",
    why: "New capitals started with 576 manpower, an odd number derived from expansion-cost math -- raising it to a round 720 gives new players more early room to expand and settle.",
    changes: [
      "A new capital's starting manpower cap (and starting manpower, which fills it) is now 720, up from 576."
    ]
  },
  {
    createdAt: 1787472289089, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23",
    title: "Settled resource tiles now show their real slot production instead of stale prose",
    why: "A settled Farm/Fish/Titanium/Gems/Umbrite tile's overview said \"Resource node can produce food once developed and collected\" even after being settled -- a holdover from the old per-day yield model. FOOD/TITANIUM/CRYSTAL/UMBRITE production moved to the slot-supply system a while ago, so that line was permanently stale and never resolved into a real number.",
    changes: [
      "A settled resource tile's overview now shows a \"Production:\" line with the actual FOOD/TITANIUM/CRYSTAL/UMBRITE slot count it contributes (e.g. \"Production: 🍞 Food +1\"), matching the format already used for buildings, instead of the old \"can produce ... once developed and collected\" prose.",
      "A Farmstead/Mine/Umbrite Rig built on its tile now visibly bumps that slot count (e.g. a Farmstead on a Farm tile shows \"Food +2\")."
    ]
  },
  {
    createdAt: 1787463213160, // 2026.08.22.15 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.15",
    title: "Fixed a spurious build error when settling into a Relay Beacon (or any settle+build)",
    why: "Queuing a settle-then-build (e.g. the frontier \"Build Relay Beacon\" action) made the client fire its own build command the moment the tile finished settling, racing the server's own durable build-on-settle. Whichever lost the race got rejected with a confusing \"tile already has structure\" error, even though the beacon still ended up built.",
    changes: [
      "The client no longer sends its own duplicate build command after an auto-settle -- the server's durable continuation now owns firing that build, so there's no race and no spurious error."
    ]
  },
  {
    createdAt: 1787462378800, // frozen from a live Date.now() call
    introducedIn: "2026.08.23",
    title: "Clearer Build Relay Beacon button text",
    why: "The frontier Build Relay Beacon button described its internal mechanics (\"expand + settle + build\") instead of what it does for the player.",
    changes: [
      "The Build Relay Beacon button on unclaimed tiles now reads \"Expand your borders\" instead of the old internal-mechanics description."
    ]
  },
  {
    createdAt: 1787462564744, // 2026.08.22.15 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.15",
    title: "Fixed the same false \"Map sync stalled\" warning on the plain \"Join Season?\" prompt",
    why: "The previous fix only covered the pending-season countdown lobby. The plain \"Join Season?\" prompt -- shown once a season is already active but you haven't clicked join yet -- has the same reason for zero map tiles (you haven't spawned), and hit the same false alarm.",
    changes: [
      "The map-sync watchdog now also stays quiet behind the \"Join Season?\" prompt, not just the countdown lobby."
    ]
  },
  {
    createdAt: 1787462189036, // 2026.08.22.14 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.14",
    title: "Fixed a false \"Map sync stalled\" warning while waiting in the season lobby",
    why: "A player waiting in the pending-season lobby hasn't spawned yet, so no map tiles have arrived for them by design -- but the map-loading watchdog didn't know that, and treated it the same as a real stuck sync, firing a \"Map sync stalled\" warning over the lobby after a few seconds.",
    changes: [
      "The map-sync watchdog now stays quiet while you're waiting in the season lobby, since there's nothing to sync yet."
    ]
  },
  {
    createdAt: 1787435600000, // 2026.08.22.13 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.13",
    title: "Fixed: another player's town could show your \"ready to upgrade\" badge",
    why: "The map's green up-arrow badge and the food-shortage badge only checked that a town had an owner, not that the owner was you, so a rival town that happened to qualify lit up on your map the same way one of your own towns would.",
    changes: [
      "The population-tier upgrade badge and the unfed-town food badge now only appear on towns you own, on both the 3D map and the classic 2D map."
    ]
  },
  {
    createdAt: 1787643819306, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.1",
    title: "Auto-settle no longer claims resource tiles before you've researched them",
    why: "Auto-settle's eligibility check for a frontier resource tile only asked whether the tile was currently within fog-of-war vision, not whether the settling player had actually researched the tech that reveals that resource (Titanium needs Masonry, Umbrite needs Leatherworking, Gems/Crystal need Crystal Lattices). That let auto-settle grab a scouted-but-unresearched resource tile out from under you before you'd unlocked it.",
    changes: [
      "Auto-settle now also requires the resource's revealing tech to be researched before it will claim that tile -- FARM/FISH tiles are unaffected since food was never tech-gated."
    ]
  },
  {
    createdAt: 1787724130000, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.1",
    title: "Restyled the settings menu's Discord button",
    why: "The \"Join the Discord\" link in the settings menu was a plain generic button that didn't stand out or read as a Discord link at a glance.",
    changes: [
      "The Discord link in Settings now uses Discord's blurple branding with the Discord logo, so it's instantly recognizable."
    ]
  },
  {
    createdAt: 1787749806338, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.26.2",
    title: "AI empires can now unblock growth when out of FOOD slots",
    why: "When an AI ran completely out of FOOD slots with no Farmstead/Waterworks/Granary build available to grow more, it had no way out -- every FOOD-costing build (including a new Relay Beacon, which is the AI's only path to claim more farmland) stayed permanently illegal, so a starved AI empire would just get stuck forever instead of expanding its way out of the shortage.",
    changes: [
      "An AI empire that's fully out of FOOD slots, with no direct way to grow more, will now disable one of its own Relay Beacons that isn't covering any resources -- a reversible fix, not a demolition -- to free up the slot for further growth.",
      "Only once no such low-value Relay Beacon exists does the AI fall back to permanently demolishing an already-starved (non-functional) building instead."
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER_2
];
