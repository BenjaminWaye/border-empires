// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered —
// client-changelog.ts sorts by createdAt. Move old entries to
// client-changelog-data-earlier.ts when this file approaches the cap.
import { CLIENT_CHANGELOG_ENTRIES_EARLIER } from "./client-changelog-data-earlier.js";
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
    createdAt: 1787650830571, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.25.1",
    title: "Farmstead now grants +2 FOOD slots instead of +1",
    why: "Farmstead's same-tile FOOD slot boost was tied with Mine/Umbrite Rig's +1, even though it's a dedicated food building -- a bigger boost makes it more worth building and gives Waterworks (which multiplies Farmstead's bonus) more to amplify.",
    changes: [
      "An active Farmstead on a FARM tile now adds +2 FOOD slots to that tile instead of +1. Waterworks' separate +2-per-Farmstead-in-radius bonus is unchanged and stacks on top."
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
    createdAt: 1787432000000,
    introducedIn: "2026.08.22.12",
    title: "Your galaxy planets and outposts now earn Influence and Production, and can lose Stability",
    why: "The galaxy view previously showed your Planets/Outposts/Stipends as a static record with nothing ongoing attached to them -- the galactic meta-layer's actual economy (docs/galactic-campaign-design.md §4/§5/§7) wasn't running yet. This introduces the first slice of that economy: a weekly Cycle tick that trickles Influence/Production income from your held territory, charges Influence upkeep for spreading wide, and drains or recovers each territory's Stability accordingly.",
    changes: [
      "Your galaxy view now shows a running Influence/Production balance, updated once per weekly Cycle based on your held Planets' and Outposts' specializations.",
      "Holding more Planets costs more Influence upkeep -- Outposts still cost nothing to hold, staying the cheap entry rung for newer empires.",
      "Each held Planet and Outpost now has a Stability meter (0-100), shown as a bar under it in the galaxy view. Falling into an Influence deficit drains your weakest territory's Stability over time; a healthy Influence surplus recovers all of them."
    ]
  },
  {
    createdAt: 1787429155443,
    introducedIn: "2026.08.22.12",
    title: "Fixed a dark \"crack\" flickering at animated shorelines",
    why: "Every coastline's animated water can dip deep enough at a wave trough to reveal the coastal skirt wall underneath it, which was shaded so dark that it read as a jarring black gap right at the shoreline.",
    changes: [
      "Brightened the coastal skirt wall's shading so it no longer looks near-black when the water's wave animation passes through a deep trough."
    ]
  },
  {
    createdAt: 1787412371498, // 2026.08.22.11 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.11",
    title: "Muster flags can now march on a chosen target instead of just the nearest enemy tile",
    why: "A muster flag's ADVANCE mode always auto-fired on whatever enemy tile happened to be nearest, with no way to point it at a specific target -- useful for holding a line, but not for actually pushing an offensive toward somewhere particular.",
    changes: [
      "New \"March To...\" muster action: pick a flag, choose \"March To...\", then click a destination tile.",
      "A marching flag fights its way toward that destination one attack at a time, always picking whichever reachable enemy tile is closest to the target -- it never crosses neutral ground, since a muster flag only ever attacks enemy territory.",
      "The flag automatically returns to HOLD once it captures the target tile, or you can cancel the march early from the tile menu."
    ]
  },
  {
    createdAt: 1787430800000,
    introducedIn: "2026.08.22.10",
    title: "Your galaxy planet now shows what it's specialized in",
    why: "The galaxy view showed which victory path crowned your planet, but not what that meant going forward -- part of the early galactic meta-layer groundwork (docs/galactic-campaign-design.md), where each victory path is meant to grant a distinct planet specialization.",
    changes: [
      "Your galaxy planet (named or not-yet-named) now shows a specialization badge -- Industrial, Trade, Extraction, Logistics, or Capital -- based on which victory condition crowned it."
    ]
  },
  {
    createdAt: 1787430700000,
    introducedIn: "2026.08.22.9",
    title: "Muster flags now clear reliably after losing a tile in combat",
    why: "Losing an attack could hand your attacking tile to the enemy, and if that tile then fell outside your visible area in the same instant, the server's notice that the tile (and its staged muster flag) changed hands never reached your client -- the flag stayed stuck on ground you no longer owned until you happened to re-scout it.",
    changes: [
      "The server now always tells you when a tile you just lost -- whether your attack's origin was overrun or a target you held was captured -- changes hands, even if you no longer have vision of it, so a cleared muster flag (and the rest of that tile's state) updates immediately instead of going stale."
    ]
  },
  {
    createdAt: 1787430600000,
    introducedIn: "2026.08.22.8",
    title: "Creating a mountain now clears any muster flag staged on the tile",
    why: "Turning a tile into a mountain destroyed the tile's ownership, but the muster flag staged on it stuck around, showing a stale muster icon on ground you no longer held.",
    changes: [
      "Creating a mountain on a tile with a staged muster flag now clears the flag along with the tile's ownership, matching how bombardment, capture, and tile shedding already handle it."
    ]
  },
  {
    createdAt: 1787430500000,
    introducedIn: "2026.08.22.7",
    title: "Stage Muster now sits above Disable on structure tiles",
    why: "On a tile with both a muster flag and a disable-able structure (e.g. Relay Beacon), Stage Muster/Set Hold/Set Advance showed up below the Disable button, making the muster controls easy to miss.",
    changes: [
      "The tile action menu now lists Stage Muster (and Set Hold/Set Advance/Clear Muster) above Disable/Enable for the tile's structure."
    ]
  },
  {
    createdAt: 1787430400000,
    introducedIn: "2026.08.22.6",
    title: "Joining a new season is now a deliberate choice",
    why: "Logging in used to silently spawn you into whatever season was active, even if you had never chosen to play it. Reconnecting was indistinguishable from joining.",
    changes: [
      "When you log in and haven't joined the current season yet, a \"Join Season\" prompt now appears instead of spawning you automatically.",
      "Confirming the prompt joins the season and spawns your starting territory; the prompt closes automatically once your empire appears."
    ]
  },
  {
    createdAt: 1787430300000,
    introducedIn: "2026.08.22.5",
    title: "Growing your territory over an enemy tile that was settled out of reach now takes it properly",
    why: "A tile could end up settled by an empire that never held any territory claim over it, which left no claim recorded for that tile at all. When your own territory later grew across it, the game treated the ground as empty and simply handed you the claim -- but because nothing was recorded as changing hands, the enemy's settled tile was never knocked back to a frontier tile. The result was an enemy town sitting inside your border that your territory could never dislodge, no matter how far your reach grew.",
    changes: [
      "When your territory grows over an enemy tile that was settled without a claim behind it, that tile now reverts to a frontier tile, the same as any other tile your border takes over.",
      "An enemy tile that is still genuinely defended by their own town, outpost or dock is unaffected -- it stays theirs, exactly as before."
    ]
  },
  {
    createdAt: 1787430200000,
    introducedIn: "2026.08.22.4",
    title: "Auto-settle no longer fires on tiles that have drifted out of reach",
    why: "Queuing a settle-then-build (or letting an AI empire's frontier auto-settle) could still fire once the tile had fallen out of reach in the meantime -- the server always rejected it as out-of-reach, but nothing checked first, so it just silently failed instead of being dropped up front.",
    changes: [
      "Both the player's queued auto-settle and an AI empire's automatic frontier settlement now check reach before sending a settle command, dropping the queued action instead of sending one that's guaranteed to be rejected.",
      "When a settled tile gets overtaken and reverts to a frontier tile because a rival's territory grew over it, it now plays a brief collapsing pylon effect on the map instead of changing silently."
    ]
  },
  {
    createdAt: 1787430100000,
    introducedIn: "2026.08.22.3",
    title: "Fixed the reach border dodging around fog of war and unexplored tiles",
    why: "Your reach border is a fixed, server-authoritative line -- it shouldn't move depending on what you can currently see. But the 2D map only drew the border on tiles it considered fully visible, so on any fogged or unexplored patch inside your own territory the line simply stopped, making it look like the border itself was carving around the fog instead of following your actual claim.",
    changes: [
      "The reach border now renders on top of fogged territory (dimmed, same as the rest of a fogged tile) instead of disappearing there.",
      "It still stays hidden over fully unexplored tiles, since there's nothing remembered there to draw it against."
    ]
  },
  {
    createdAt: 1787430000000,
    introducedIn: "2026.08.22.2",
    title: "An empire with no war industry is now also weaker on defense, not just on offense",
    why: "Owning zero Titanium and zero Umbrite Weapons Factories empire-wide already doubled an attacker's effective attack against you -- but that bonus only ever helped the attacker. If you had no war industry and someone else attacked you, defending gave you no comparable penalty or advantage either way.",
    changes: [
      "Defending against an attacker who owns zero Titanium AND zero Umbrite Weapons Factories anywhere in their empire now doubles your effective defense, mirroring the existing attack-side vulnerability from the other direction. Missing one factory type or both gives the same flat bonus -- it doesn't stack higher for missing both."
    ]
  },
  {
    createdAt: 1787484432246, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.2",
    title: "Fixed the whole screen becoming unclickable after submitting a bug report",
    why: "Closing the redesigned bug report dialog (including automatically, after a successful submit) only cleared its contents -- the full-screen invisible container div stayed in the DOM with pointer-events left on, silently intercepting every click across the entire game until you reloaded the page.",
    changes: [
      "Closing the bug report dialog (including the automatic close after a successful submission) now properly stops it from blocking clicks, so the game stays fully interactive without needing a page reload."
    ]
  },
  {
    createdAt: 1787509343955, // frozen from `date +%s%3N`
    introducedIn: "2026.08.23.3",
    title: "Reach no longer spreads across open water",
    why: "A town, outpost, or dock's reach radius was purely geometric with no terrain awareness, so a coastal or island anchor's disk routinely covered land on the far side of a bay or strait even with no unbroken land route to it -- letting you EXPAND/SETTLE onto land you had no real connection to.",
    changes: [
      "A normal reach anchor's radius now only extends onto land reachable by an unbroken land path from the anchor, within the radius -- water is still included right at the coastline, it just can't act as a stepping-stone onto land further out.",
      "The Aether Bridge's water-crossing reach grant is unaffected -- bridging across water without a land connection is still exactly what it's for."
    ]
  },
  {
    createdAt: 1787509994281, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.23.3",
    title: "Fixed queued settlements/builds sometimes sitting stalled after logging back in",
    why: "A queued SETTLE or BUILD only starts once an earlier one in your queue finishes, and that hand-off only happens when the server notices a slot just freed up. If a slot freed up while you were disconnected, nobody was around to trigger that hand-off, so your next queued action could sit stalled -- looking untouched -- until some unrelated action elsewhere happened to free another slot.",
    changes: [
      "Logging back in now immediately checks your queue for anything that's actually free to start, instead of waiting on an unrelated event to notice."
    ]
  },
  {
    createdAt: 1787519500000, // frozen from a live Date.now() call
    introducedIn: "2026.08.23.8",
    title: "Added a \"Suggest Improvement\" button next to Report Bug",
    why: "Players had a way to report bugs from Settings, but no equivalent in-app way to send us an improvement idea -- feedback ended up scattered across Discord instead.",
    changes: [
      "Settings > Diagnostics now has a green-bordered \"Suggest Improvement\" button below \"Report Bug\", opening the same style of form (with client/server context attached automatically) but posting to a separate suggestions inbox."
    ]
  },
  {
    createdAt: 1787557977223, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.24.1",
    title: "Fixed laggy panning/zooming on wide monitors",
    why: "The map's per-frame draw loop redrew every on-screen tile with no ceiling on how many tiles that could be. On a wide or ultrawide monitor zoomed all the way out, that meant tens of thousands of tiles redrawn every single frame -- pegging the main thread and making panning and zooming visibly stutter, especially on larger screens.",
    changes: [
      "The map now caps how many tiles it draws per frame to the same budget already used elsewhere in the renderer, shrinking the visible radius slightly (rather than stalling) only in the most zoomed-out state on unusually wide screens."
    ]
  },
  {
    createdAt: 1787584599966, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.24.6",
    title: "Added basic sign-up analytics",
    why: "We had no way to see where new players were coming from, or how many visitors from a shared link actually created an account -- link attribution and conversion were both invisible.",
    changes: [
      "The client now reports page landings and a sign-up event (for new accounts created by email, Google, or email-link sign-in) to Google Analytics, so shared links can be attributed by source/campaign and tracked through to conversion."
    ]
  },
  {
    createdAt: 1787584599967, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.24.7",
    title: "Renamed AI empires to first names only",
    why: "AI empire names paired a first name with a surname that read as a fantasy/game surname (e.g. \"Sigrid Storm\", \"Edvin Frost\"), which looked out of place next to real players' names on the leaderboard.",
    changes: [
      "AI-controlled empires on the leaderboard now show a single first name (e.g. \"Sigrid\", \"Edvin\") instead of a first-plus-surname combo."
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
    createdAt: 1787643819307, // frozen just after this file's prior latest entry, to avoid a createdAt collision
    introducedIn: "2026.08.25.2",
    title: "Fixed spawns landing next to resources across water",
    why: "A new player's starting position only had to be within straight-line distance of a farm or fishing spot to count as \"nearby\" -- so a spawn could land on a coastline whose closest food was actually on the far side of a strait or a separate island, unreachable without crossing water.",
    changes: [
      "Spawn placement now requires that nearby food and towns be on the same landmass as the spawn point, not just within range as the crow flies."
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER
];
