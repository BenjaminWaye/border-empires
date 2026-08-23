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
    createdAt: 1787501551525, // frozen just after this file's prior latest entry, to avoid pushing the 6-day window past an older "earlier" entry
    introducedIn: "2026.08.23.5",
    title: "AI empires no longer play ahead during the season lobby countdown",
    why: "Locking new human players out of a season until the lobby countdown finished didn't also stop AI empires from acting -- they kept building, expanding, and fighting during the countdown, so by the time human players were let in the AI had a head start nobody could see coming.",
    changes: [
      "AI empires now stay locked out of taking any actions during the lobby countdown, just like new human players, until the season actually starts."
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
    createdAt: 1787324700000,
    introducedIn: "2026.08.21.5",
    title: "Players now get a season-start email, and the previous champion gets a victory email",
    why: "When a season rolled over, nothing told players by email that the map had reset -- they'd only find out by opening the game. And the player who was just crowned champion had no record of their win beyond the in-game season-end screen.",
    changes: [
      "Every player with an email on file now gets a branded \"A New Season Has Begun\" email when a new season starts, crediting the previous season's champion if there was one and pointing them to the season recap screen to browse final stats for friends and foes.",
      "The player who won the previous season gets that same email with a victory recap folded in, calling out the objective they won through, instead of a separate message."
    ]
  },
  {
    createdAt: 1787360000000,
    introducedIn: "2026.08.21.7",
    title: "Fixed the settle animation not showing until you panned the camera",
    why: "Pressing Settle on a frontier tile marks it optimistically pending without changing its owner or ownership state (both already belonged to you), but the 3D map only rebuilt its terrain and overlays when ownership actually changed. That left the new settle overlay instance uncreated until something else -- like panning -- forced a rebuild for an unrelated reason.",
    changes: [
      "The settlement animation now plays immediately when you press Settle, instead of waiting for the next camera pan."
    ]
  },
  {
    createdAt: 1787340000000,
    introducedIn: "2026.08.21.6",
    title: "The rush-buy price preview now accounts for the Quickforge discount",
    why: "The tile menu's rush-buy price chip always showed the full server price estimate, even for a player who owns a Quickforge with today's discount still unused — the number shown was different from what got charged.",
    changes: [
      "The rush-buy price chip now shows the discounted price when you own a Quickforge and haven't used its once-per-day discount yet."
    ]
  },
  {
    createdAt: 1787330000000,
    introducedIn: "2026.08.21.5",
    title: "The Quickforge wonder now discounts a rush-buy instead of making it free",
    why: "The Quickforge's once-per-UTC-day rush-buy perk waived the gold cost entirely, which trivialized cheap rush-buys (like a Settle at 10 gold) and scaled unevenly across rush-buy prices.",
    changes: [
      "Once per UTC day, the Quickforge's controller now gets 40 gold off their next rush-buy (floored at 0) instead of that rush-buy being completely free."
    ]
  },
  {
    createdAt: 1787356800000,
    introducedIn: "2026.08.21.3",
    title: "Fixed a crash when switching apps and back while a location theme was playing",
    why: "Backgrounding the tab pauses playback; returning to it resumes both the music bed and any location theme. The location theme's resume call didn't catch play() rejections the way the music bed's did, so a fast switch-away-and-back (interrupting that play() with a pause()) threw an unhandled rejection that tripped the app's error boundary, showing \"Border Empires hit a problem loading\".",
    changes: [
      "Switching to another app and back no longer crashes the game to the error screen."
    ]
  },
  {
    createdAt: 1787322800000,
    introducedIn: "2026.08.21.1",
    title: "Composite settle+build orders (e.g. Build Relay Beacon) now survive logging out mid-order",
    why: "Clicking a composite action like \"Build Relay Beacon\" on an unowned tile sends the expand immediately, then relied purely on this client's own in-memory bookkeeping to notice the expand land and fire the follow-up settle, then notice the settlement land and fire the build. If you logged out (or your connection dropped) between the click and either of those follow-ups, nothing server-side was watching to continue the chain, so the order silently stalled.",
    changes: [
      "Settle+build orders (fresh expand-then-settle-then-build, and settle-then-build on an already-owned tile) now also register server-side, so they keep completing even if you disconnect right after clicking."
    ]
  },
  {
    createdAt: 1787322201581,
    introducedIn: "2026.08.21",
    title: "Tension music now plays while a muster flag is staged, not just when an attack is mid-flight",
    why: "Tension (\"war is coming\") music used to be driven by short-lived, per-attack timers (an attack in transit, a deferred send, an incoming-attack tracker) that clear the instant that specific attack resolves, so it kept dropping back to calm music between attacks even while a muster flag was still staged and ready to fire.",
    changes: [
      "Tension music now plays for as long as any muster flag is raised and set to Hold (staged, not yet advancing), which is a stable signal instead of one that clears after every individual attack."
    ]
  },
  {
    createdAt: 1787326342941, // 2026.08.21.4 — frozen from a live Date.now() call
    introducedIn: "2026.08.21.4",
    title: "AI opponents now build a wider range of structures, and beacon relays more often",
    why: "AI opponents could previously only ever build 5 kinds of structures (Farmstead, Umbrite Rig, Mine, Mintworks, Granary), scored by fixed numbers instead of what the AI's economy actually needed. Their Relay Beacon building was also just as likely at any time, whether or not there was still good territory left nearby to claim.",
    changes: [
      "AI opponents can now also build Waterworks, Ministry Hall (Governors Office), Ancillary Factory (Garrison Hall), Logistics Guild, Caravanary, and the Umbrite/Titanium/Crystal Synthesizers, chosen based on which resource or manpower shortfall is most acute rather than a fixed priority list.",
      "AI opponents now favor Relay Beacon construction in bursts — several in a row, then a pause where other buildings get priority — instead of a flat, constant likelihood throughout the game."
    ]
  },
  {
    createdAt: 1787296000000, // 2026.08.21.2 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.21.2",
    title: "Relay beacons are now destroyed when their tile is captured",
    why: "Every other structure kept its old survive-capture behavior, but a relay beacon transferring intact to the attacker let a single capture instantly hand over both the tile and a working reach anchor on it — same treatment siege outposts already get.",
    changes: [
      "Capturing a tile with a relay beacon on it now destroys the beacon instead of transferring ownership.",
      "The attacker still takes the tile itself; they'll need to rebuild a relay beacon there to project reach from it."
    ]
  },
  {
    createdAt: 1787295212839, // 2026.08.21.1 — frozen from a live Date.now() call left in by the merged commit
    introducedIn: "2026.08.21.1",
    title: "Fixed research (tech/domain) picks being lost on server restart or deploy",
    why: "On startup, the simulation server rebuilds state from the latest checkpoint snapshot and then replays any events recorded after that checkpoint. That replay step had no handler for tech or domain research events, so a research pick made after the last checkpoint but before a restart or deploy was silently dropped instead of being reapplied — the player would come back with an earlier set of researched techs/domains than they actually had.",
    changes: [
      "Tech and domain research chosen shortly before a server restart or deploy is now correctly preserved instead of sometimes reverting to an earlier state."
    ]
  },
  {
    createdAt: 1787345991317,
    introducedIn: "2026.08.21",
    title: "War music no longer flickers back to calm music during an ongoing war",
    why: "War music was driven only by whether a battle-clash animation was actively playing, which is pruned a few seconds after each individual skirmish resolves. During a sustained war, that gap between skirmishes flipped the music back to calm and then straight back to combat, over and over.",
    changes: [
      "War music now also stays engaged for as long as any muster flag is set to Advance, since that's a durable sign of an ongoing offensive rather than a single skirmish's animation window."
    ]
  },
  {
    createdAt: 1787322201580, // 2026.08.21 — frozen; was Date.now() in the merged commit
    introducedIn: "2026.08.21",
    title: "Border-expansion pylon animation is slower and more dramatic",
    why: "The survey pylon rise/sink and laser on/off animation that plays when your border expands or contracts was over in about 1.3 seconds per pylon, which made it easy to miss entirely.",
    changes: [
      "Retiring pylons now take about 3 seconds to fade their laser and sink into the ground, and arriving pylons take about 3.2 seconds to rise and power their laser on.",
      "New pylons/lasers along an expanding border now stagger in more visibly, one at a time, instead of all rising together."
    ]
  },
  {
    createdAt: 1787356800001, // 2026.08.21, after the entries below
    introducedIn: "2026.08.21",
    title: "Shard rain impact sites now show on the map, even before you've explored them",
    why: "A shard rain event's landing sites were previously only ever shown as a text notice (\"Nearest site is ~N tiles NE\") or as an in-tile icon once you'd actually explored that tile. There was no way to see where the other sites were at a glance, or to navigate straight to one.",
    changes: [
      "Every active shard rain site now shows as an arrow-shaped badge pointing off-screen toward it, the same locator system muster flags use — click it to jump the camera there.",
      "Once you scroll a site on-screen, a small shield badge hovers over that exact tile, bobbing gently in place — the same badge style as the unfed-town warning, with a shard icon instead. It's just a positional blip from the event broadcast, not confirmation the shard is still there, especially on a tile you haven't explored yet.",
      "Both the off-screen badge and the on-screen badge stay up for the full ~30-minute life of the shard rain event, not just the first moments after landing."
    ]
  },
  {
    createdAt: 1787295247575, // 2026.08.21.3
    introducedIn: "2026.08.21.3",
    title: "Map zoom is now smooth and responsive",
    why: "Zooming used to feel sluggish for two compounding reasons: each wheel notch only moved the zoom level by 1 out of a 10-192 range, so crossing the range took roughly 180 notches; and every single notch tore down and re-uploaded the entire visible terrain to the GPU, which alone cost ~74ms and pinned the frame rate around 10fps for the whole gesture.",
    changes: [
      "A wheel notch now moves zoom by a proportional step instead of a flat ±1, so the full zoom range crosses in about 15-20 notches instead of ~180.",
      "The 3D renderer now only rebuilds the visible terrain when the camera actually needs tiles outside what's already loaded, instead of on every zoom or pan change -- zooming in no longer triggers a rebuild at all, and frame rate stays smooth while zooming or making small-to-moderate pans."
    ]
  },
  {
    createdAt: 1787381546606, // 2026.08.22.2 — frozen from a live Date.now() call
    introducedIn: "2026.08.22.2",
    title: "Seasons now have a player cap, and you can ask to be emailed when the next one opens",
    why: "A season previously had no limit on how many empires could join, which meant a season already crowded with players kept quietly admitting more instead of ever being \"full.\" There was also no way to find out when a fresh, uncrowded season was starting if you missed joining one.",
    changes: [
      "A season now stops admitting brand-new players once it reaches its player cap; anyone with an existing empire in that season can still log back in as normal.",
      "Trying to join a full season shows a \"This season is full\" screen with an \"Alert me when next season starts\" button.",
      "Clicking it confirms you'll get the same season-start email already sent to every signed-in player when the next season begins."
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
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_EARLIER
];
