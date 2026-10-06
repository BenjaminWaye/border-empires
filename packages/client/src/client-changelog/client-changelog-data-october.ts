import type { ClientChangelogEntry } from "./client-changelog-data.js";

const OCTOBER_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1790884828288, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.1",
    title: "Smoother 3D map while a tile is selected",
    why: "With a tile selected, the 3D map re-worked out which ground was in your reach on every frame, which made it stutter and lag on larger empires.",
    changes: [
      "Your reach is now worked out once per change instead of every frame, so selecting tiles no longer drags down the frame rate in the 3D map",
      "The 2D map shares the same reach cache. Reach borders and the orange out-of-reach selection tint look and behave exactly as before"
    ]
  },
  {
    createdAt: 1790706701000,
    introducedIn: "2026.09.29.2",
    title: "Modules now visibly land on your AFC",
    why: "Researching an AFC Module used to just make it appear on your AFC with no feedback, so it was easy to miss that the delivery had happened at all.",
    changes: [
      "True-3D renderer: when a Manifest Module docks on your AFC, a cargo streak now burns down onto the complex and lands in a flash, shockwave and dust cloud",
      "2D canvas renderer (accessibility fallback): the AFC glyph briefly flares with a brass ring instead -- 2D has no per-module visuals, so it does not play the full sequence",
      "Only your own AFCs animate, and a delivery that happened while you were offline is not replayed when you reconnect"
    ]
  },
  {
    createdAt: 1790712449220,
    introducedIn: "2026.09.29.3",
    title: "Palisades and Forts now stack with Relay Beacons, and forts keep defending while they upgrade",
    why: "Building a Palisade on a Relay Beacon or Harbor Exchange silently destroyed it, a Fort built on a Relay Beacon made the beacon vanish from the map, and the tile info only ever named one of the two. Palisades also never actually applied the defense their build menu advertised, and upgrading any fort left the tile undefended until the new tier finished.",
    changes: [
      "A Palisade now stacks on a Relay Beacon or Harbor Exchange exactly like a Fort does, instead of replacing it (a beacon already lost this way can't be restored)",
      "A Relay Beacon that shares its tile with a Palisade or Fort is now drawn on the map, on both the 3D and the 2D map",
      "The tile info's \"Built:\" line now lists every structure on the tile, e.g. \"Built: Fort, Relay Beacon\"",
      "Palisades now really defend in combat: 1.35x defense, attackers need 150 mustered manpower and risk losing 100-150 of it",
      "While a Palisade or Fort upgrades to its next tier, the current one keeps standing and defending until the upgrade completes; cancelling an upgrade, or losing the tile mid-upgrade, now keeps the current fort instead of destroying it",
      "Existing Palisades are carried over automatically"
    ]
  },
  {
    createdAt: 1790706701001, // frozen, 1ms after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.29.3",
    title: "Empire names are now unique, and new players start with a noble house name",
    why: "Any number of players could pick the same name, so alliance and truce requests (which find a player by name) could reach the wrong empire, and two rivals could look identical on the leaderboard.",
    changes: [
      "Two empires can no longer share a name: picking one that's taken (ignoring capitals and spacing) is rejected with a free alternative suggested, like \"House Ashgrove II\"",
      "New players now start with a free noble house name already filled in, such as \"House Valmont\", which you can change in the name step",
      "Names you already have are kept, even if someone else has the same one"
    ]
  },
  {
    createdAt: 1790706701002, // frozen, 1ms after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.29.4",
    title: "You can now jump into a game as a guest with one click",
    why: "Every new player had to sign up before they could even see the game, and Google sign-in doesn't work inside the browsers built into Instagram, TikTok or Discord, which is where most invite links get opened.",
    changes: [
      "The sign-in screen now leads with \"Play now\": one click starts a guest empire with no account, and takes you straight into the season",
      "Guests are named \"House Noname 1\", \"House Noname 2\" and so on, so everyone can tell who is a guest, and skip the name and colour step",
      "Guests can't make alliances or truces, and a guest empire lives in the browser it was started in",
      "If the guest spots, or the whole season, are full you're taken back to the sign-in screen with the reason shown",
      "Rally invite links now offer \"Play now\" as well as signing in, and on a browser where you've signed in before, \"Play now\" is shown as the secondary button"
    ]
  },
  {
    createdAt: 1790706701003, // frozen, 1ms after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.29.5",
    title: "Guests can now save their empire to a real account",
    why: "A guest empire disappeared as soon as the browser data was cleared and could never make alliances, so there was no way to keep playing an empire you had started with \"Play now\".",
    changes: [
      "A gold \"Guest\" badge appears in the game: tap it to save your empire with Google or an emailed link, and keep the same empire, alliances and season emails",
      "Saving is offered automatically when you try to make an alliance or truce, and once after about ten minutes of play",
      "After saving you choose your name and colour, and your \"House Noname\" number is freed for the next guest",
      "If the account you pick already has an empire you can switch to it, but the guest empire is left behind",
      "Starting a guest empire inside the in-app browser of Instagram, TikTok or Discord now tells you up front that it can only be saved from your device's own browser, instead of only finding out when you try to save"
    ]
  },
  {
    createdAt: 1790706701004, // frozen when the socket-delivery entry was merged into develop
    introducedIn: "2026.09.29.6",
    title: "Module deliveries now target their AFC socket",
    why: "The delivery animation previously landed at the middle of the whole complex, even when the module's permanent model docks in a visible socket around it.",
    changes: [
      "True-3D module deliveries now land directly on the rendered socket for modules with map art; modules awaiting their own 3D art still use the AFC-centre landing effect"
    ]
  },
  {
    createdAt: 1790724338616, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.29.2",
    title: "Fishing sites have a new look",
    why: "Fishing tiles were drawn as a few plain boxes. They now use a modelled fishing site that reads better on the map and lets the water or shore show through underneath.",
    changes: [
      "Every fishing resource tile in the 3D map now shows a low-poly fishing site with boats, a hut, a drying rack and a flag",
      "The site has no ground plate, so the terrain beneath it stays visible",
      "Each site turns to face the water, with its vats and cranes on the water side and the hut on the land side",
      "The 2D fallback renderer is unchanged"
    ]
  },
  {
    createdAt: 1790706701004, // frozen, 1ms after the newest existing entry (this branch's photo-mode/opacity work predates "Modules now visibly land on your AFC" but merged in after it)
    introducedIn: "2026.09.29.7",
    title: "Photo mode for clean map screenshots",
    why: "Sharing a screenshot of a border fight meant cropping around the top bar, minimap and tip popups, so it was hard to show the game off.",
    changes: [
      "Add ?photo=1 to the game address to hide the top bar, minimap, panels and tip popups and show only the map",
      "Add &photoX=<tile>&photoY=<tile>&photoZoom=<zoom> to start on a specific spot; the view unlocks as soon as you drag, scroll or press a key",
      "Works in both the 3D map and the 2D fallback map"
    ]
  },
  {
    createdAt: 1790706701005, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.29.7",
    title: "Empire colours on the 3D map are vivid again",
    why: "Territory was drawn so see-through that the dark terrain underneath dulled every empire's colour, so a border between two empires was hard to spot at a glance.",
    changes: [
      "In the 3D map, land you have settled now shows your empire colour at full strength instead of a muddy blend with the ground (a gold empire is gold again, not olive)",
      "Newly claimed frontier land stays lighter so it is still easy to tell from settled land"
    ]
  },
  {
    createdAt: 1790706701006, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.29.7",
    title: "Photo mode is now a Settings toggle too",
    why: "Turning on Photo Mode meant typing a web address or opening the browser console, so it was easy to forget how and only realistic for whoever wrote it down.",
    changes: [
      "Settings > Gameplay now has an Enter/Exit Photo Mode button next to Reveal Full Map",
      "Press Esc, or the on-screen button that appears, to bring the top bar and panels back"
    ]
  },
  {
    createdAt: 1790724338615, // frozen while resolving the develop merge
    introducedIn: "2026.09.30.1",
    title: "Rally links now show a proper preview card when you share them",
    why: "A rally link pasted into WhatsApp, Discord, iMessage or X used to appear as plain \"Border Empires\" with no picture, so a friend had no idea why they should click it.",
    changes: [
      "Sharing a rally link now shows a preview card with a screenshot of a real border clash between two empires and \"Join their rally. Plant your banner at their doorstep.\"",
      "Links that have expired or run out of uses still show a normal Border Empires card instead of a blank one"
    ]
  },
  {
    createdAt: 1790757301381, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.2",
    title: "More reliable guest sign-in",
    why: "A busy game database could freeze the realtime gateway while a new guest was signing in, leaving Play Now stuck before the map opened.",
    changes: [
      "Guest sign-in now retries temporary database contention without freezing the realtime connection",
      "Staging release checks now include a real Play Now sign-in and wait longer for delayed server failures"
    ]
  },
  {
    createdAt: 1790756975653,
    introducedIn: "2026.09.30.3",
    title: "Map overlays no longer float above hills",
    why: "Flat tile overlays on hills were parked at the hill's tallest possible height, well above the visible ground, so they hovered in the air in the 3D map.",
    changes: [
      "True-3D attack markers, weak-defence warnings, shield-area washes, win-chance labels, crystal targeting and dormant frontier tiles now sit on top of hill tiles instead of floating above them"
    ]
  },
  {
    createdAt: 1790832148785, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.1",
    title: "Auto-settle never guesses your choice",
    why: "If your auto-settle choices hadn't reached the game yet, the client could treat everything as switched on and queue settlements, spending manpower you hadn't agreed to.",
    changes: [
      "Until your auto-settle choices load, nothing settles on its own and the settle prompt stays hidden; Settings > Gameplay shows a loading note instead of guessed checkboxes",
      "Existing players keep everything on, exactly as before"
    ]
  },
  {
    createdAt: 1790829285128, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.1",
    title: "Rally links created on staging now open correctly",
    why: "A rally link made on the staging site pointed at the live game, so opening it said the invite was expired or no longer available.",
    changes: [
      "Rally links now always point at the same site they were created on"
    ]
  },
  {
    createdAt: 1790764600000, // frozen Date.now() value for this release
    introducedIn: "2026.09.30.5",
    title: "Admin settings page with a live lighting tuner",
    why: "Building lighting looked too strong in places, and every adjustment meant a code change and a deploy just to see whether it looked better.",
    changes: [
      "Settings has a new Admin page (admin accounts only) that now holds Reveal Full Map and Photo Mode, moved off the Gameplay page",
      "The Admin page adds a Lighting Tuner: sliders for the sun, sky fill, back fill, shadows, metal reflections and exposure, applied live to the 3D map"
    ]
  },
  {
    createdAt: 1790874861641, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.2",
    title: "Barbarians no longer stand frozen in front of you",
    why: "A barbarian one tile off your border could sit still for minutes while another barbarian elsewhere on the map kept attacking, because all barbarians shared a single turn and attacks always went first.",
    changes: [
      "Every barbarian you can see now takes its own turns, so one fight elsewhere can't hold the rest back",
      "A barbarian rests 15 seconds after its action finishes (it used to count from when the attack started, so there was no rest at all after a 30 second fight)",
      "Barbarians only wake when a player can actually see them, using the same fog of war you do, and when many barbarians want to attack at once the extra ones walk instead of standing still",
      "At the 100-tile barbarian limit, barbarians in view keep moving and fighting while unseen ones are released, and a win at the limit no longer grows their territory"
    ]
  },
  {
    createdAt: 1790830401398,
    introducedIn: "2026.10.01.1",
    title: "Advance flags clear barbarians and report back",
    why: "Sending a flag after barbarians out in the wilderness (or a rival's border a few tiles off) meant expanding out to touch each one yourself and re-launching attacks by hand, and a flag only acted once every 30 seconds unless you had its menu open.",
    changes: [
      "An Advance flag now walks toward barbarians and rival borders within 10 steps that don't touch your territory yet, expanding across empty land to reach them, then attacks them. Steps go through your land and empty land only, so enemies across water or behind mountains aren't counted",
      "Marches are now limited to 15 tiles. Aiming one further shows advice to raise a muster flag closer instead, since troops take much longer to walk across the map than it takes to muster next to the fight",
      "Advance flags no longer try to attack allies or players you have a truce with",
      "Advance flags act every second, with up to three fights at once, even when you're not looking at them",
      "When nothing hostile is left in range, the flag returns to Hold and posts \"Area cleared\" to your Activity Feed",
      "A flag that is rejected (not enough coin or manpower) now backs off instead of retrying every second"
    ]
  },
  {
    createdAt: 1790885511154, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.3",
    title: "Your reach border is correct when you play in a second tab or device",
    why: "If you were still connected somewhere else (another tab, your phone, or a reconnect before the old connection timed out), the new session never received your real reach border. It drew an estimate instead, and waypoints could keep planning expansions the server then refused as out of reach.",
    changes: [
      "Every new session now receives your current reach border as soon as it loads, even while you're connected elsewhere",
      "Waypoints in that session plan against your real border, so they stop retrying expansions that are out of reach"
    ]
  },
  {
    createdAt: 1790891485732, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.4",
    title: "The staging game server moved to faster hosting",
    why: "Staging ran on a throttled shared CPU that froze for 30 seconds or more under load, which made logins on staging fail or stall.",
    changes: [
      "Staging now connects to api-staging.borderempires.com on a dedicated server",
      "Logins on staging should no longer stall while the server catches up"
    ]
  },
  {
    createdAt: 1790939769000, // frozen Date.now() value for this release
    introducedIn: "2026.10.02.2",
    title: "What's New no longer jumps back to the top while you scroll",
    why: "The Activity window rebuilt itself every time the game refreshed in the background, which reset your scroll position, and the Updates list also shrank to the latest ten entries right after you opened it.",
    changes: [
      "Scrolling through What's New, Yours or World Pulse now stays where you left it",
      "Opening Updates keeps showing the new entries for as long as the window stays open"
    ]
  },
  {
    createdAt: 1790935593754, // frozen Date.now() value for this release
    introducedIn: "2026.10.02.1",
    title: "Cleaner landing sites for your Fabrication Complex",
    why: "A new empire's Automated Fabrication Complex could land hemmed in by water, mountains or thick forest, leaving a cramped and slow start.",
    changes: [
      "Your Fabrication Complex now always lands on a tile with no water on any of its 8 surrounding tiles",
      "Any mountains on the landing tile's 8 neighbours are flattened into open land when it lands",
      "Forest is cleared from the landing tile and all 8 neighbours, so the area around your Complex is quick to claim and settle and doesn't block your sight",
      "When you watch your Complex land, the trees and mountains disappear at touchdown, under the landing smoke"
    ]
  },
  {
    createdAt: 1790945926297, // frozen Date.now() value for this release
    introducedIn: "2026.10.02.2",
    title: "Buildings are now sorted into categories",
    why: "A developed tile can offer 30 or more buildings, and finding the one you wanted meant scrolling a single long list.",
    changes: [
      "The Buildings tab now has category squares: Military, Resource, Town Support, Infrastructure and Monuments",
      "A category with nothing you can build on that tile is grayed out, and hovering it tells you why",
      "The Monuments square only appears once you have researched a monument's tech",
      "Hydrogardens now say they add +2 FOOD slots on grain resource tiles"
    ]
  },
  {
    createdAt: 1790958525863, // frozen Date.now() value for this release
    introducedIn: "2026.10.02.3",
    title: "You can no longer abandon your Fabrication Complex",
    why: "Abandoning your Automated Fabrication Complex took away the reach it gives, so every frontier tile around it started decaying as \"Beyond your reach\".",
    changes: [
      "Abandon Territory is no longer offered on your own Automated Fabrication Complex, and the server rejects it",
      "Your Complex can still be lost in combat, the same as your Settlement"
    ]
  },
  {
    createdAt: 1790957901665, // frozen Date.now() value for this release
    introducedIn: "2026.10.02.4",
    title: "The game server moved to faster, dedicated hosting",
    why: "The server ran on a shared, throttled CPU, which could freeze for 30 seconds or more under load and make logins stall.",
    changes: [
      "The game now connects to api.borderempires.com",
      "Logins and moves should stay responsive when the server is busy"
    ]
  },
  {
    createdAt: 1791005026034, // frozen Date.now() value for this release
    introducedIn: "2026.10.03.1",
    title: "Clearer, shorter attacks on your frontier",
    why: "When an enemy muster flag attacked your frontier you only saw a red cross: no soldiers, a timer that could run for minutes, a 50/50 bar that looked like real odds, and counter-attacks that failed with \"tile locked in combat\".",
    changes: [
      "An enemy taking your frontier tile now looks the same as when you take theirs: your colour clears, theirs sweeps in, and their soldiers stand on the tile (3D and 2D)",
      "Muster-flag attacks no longer take minutes when the flag is across a dock or the map edge: travel is capped at the 15-tile march limit",
      "The Under attack card no longer shows a fake 50/50 odds bar, and says when the enemy is still marching or that frontier land has no defenders",
      "Attacking the tile an enemy is attacking you from now tells you up front how long it stays locked, instead of mustering and then failing",
      "A rejected muster attack no longer leaves its flag stuck and over-filling (70/60 climbing to 120) before it can fire again"
    ]
  },
  {
    createdAt: 1791318269732, // frozen Date.now() value for this release
    introducedIn: "2026.10.06.1",
    title: "Fabrication Complexes: 8 modules each, and losing one now costs more",
    why: "Losing your last AFC dropped a new one onto open ground for free, so captured AFCs piled up across the map, and every lost module came straight back at once.",
    changes: [
      "If your last AFC is captured, build a new one yourself, free: tap any empty tile in your territory and choose Build AFC",
      "Lost modules come back one per minute, Economy modules first",
      "Each AFC holds 8 modules. When all your AFCs are full, a newly researched module waits until you build another AFC",
      "Capturing an enemy AFC also plunders 33% of their Coin",
      "Fixed: AFCs disappeared after a server restart and a new one appeared somewhere else"
    ]
  }
];

// The live changelog's newest entry is maintained in client-changelog-data.ts.
// These October entries are retained here as source history, but entries older
// than that live window must not enter the client bundle.
const oldestAllowedAt = 1790707598992;

export const RECENT_CLIENT_CHANGELOG_ENTRIES = OCTOBER_CHANGELOG_ENTRIES.filter(
  (entry) => entry.createdAt >= oldestAllowedAt
);
