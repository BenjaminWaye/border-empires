// Changelog entry data only, split out from client-changelog.ts (rendering/
// visibility) to keep that file under the 500-line cap. Entries are unordered --
// client-changelog.ts sorts by createdAt.
// The "keeps only the latest week" test drops any entry whose createdAt is
// more than 6 days before the newest entry. When new entries age older ones out
// of that window, move those entries into the next
// client-changelog-data-earlier-N.ts (historical record, left unreferenced)
// and delete them here and from the per-feature files below.
import { CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS } from "./client-changelog-recent-groups.js";
import { CLIENT_CHANGELOG_ENTRIES_TERRAIN } from "./client-changelog-data-terrain.js";
import { CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD } from "./client-changelog-activity-dashboard.js";
import { CLIENT_CHANGELOG_ENTRIES_RECENT } from "./client-changelog-data-recent.js";
import { CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE } from "./client-changelog-new-player-experience.js";
import { CLIENT_CHANGELOG_ENTRIES_SEPT_24_26 } from "./client-changelog-data-sept-24-26.js";
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
    createdAt: 1790702571173, // frozen, 1ms after the newest existing entry -- keeps the "latest week" window from shifting
    introducedIn: "2026.09.29.1",
    title: "Aether Towers now reliably shield your land -- even from attackers who can't see them",
    why: "Only Aether Purge and Aether EMP were checked against enemy Aether Towers. Aether Bridge landings and Create/Remove Mountain went through even next to an enemy tower, and a tower also blocked abilities on land it didn't own.",
    changes: [
      "An Aether Tower now protects only its owner's own tiles within its radius -- never unclaimed land or another player's tiles -- and the tower description says so",
      "Aether Bridge can't land on enemy land their Aether Tower protects; landing on unclaimed land is never blocked",
      "Create/Remove Mountain are blocked on land protected by its owner's Aether Tower, like Aether Purge and EMP",
      "Hidden enemy Aether Towers block these abilities too -- you'll see \"blocked by an Aether Tower\" when that happens"
    ]
  },
  {
    createdAt: 1790702571174,
    introducedIn: "2026.09.28.1",
    title: "Login now shows each step of building your map",
    why: "After your world downloaded, the login screen sat on \"Building your map\" with a full progress bar while the map was built in one long freeze, so it looked stuck.",
    changes: [
      "After the download, the login screen now walks through each step of building your map (setting up graphics, shaping the land, placing towns, preparing shaders, drawing the map) with \"Step 2 of 5\" and about how long is left",
      "The time estimate learns how fast your device builds each step, so it gets more accurate after your first login",
      "Logging in with a large empire freezes the screen for less time: the minimap is drawn in small pieces after the map appears, and the Empire Integrity panel is no longer recalculated on every screen refresh"
    ]
  },
  {
    createdAt: 1790450114918, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.21.2",
    title: "Gold is now called Coin",
    why: "\"Gold\" never fit a game with no gold resource tiles or gold-colored anything -- it was just the name of the currency you earn from towns and docks. Renamed the display text to Coin throughout the game; nothing about how it's earned or spent changed.",
    changes: [
      "Every player-facing mention of Gold (HUD, build costs, tech costs, tooltips, discovery tips, alerts, and activity feed) now says Coin instead",
      "No gameplay change: amounts, costs, and income formulas are exactly the same as before"
    ]
  },
  {
    createdAt: 1790450114919, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.22.1",
    title: "Eight buildings renamed",
    why: "Continuing the same renaming pass as the Gold-to-Coin change: eight more buildings had names left over from earlier working titles that no longer matched the game's steampunk-fantasy setting.",
    changes: [
      "Farmstead is now Hydrogarden",
      "Waterworks is now Hydroworks",
      "Aetherport is now Sky Dock",
      "Advanced Umbrite Works is now High-Yield Umbrite Works",
      "Advanced Titanium Works is now High-Yield Titanium Works",
      "Advanced Aether Condenser is now High-Yield Aether Condenser",
      "Population Bureau is now Census Directorate",
      "Worldbreaker Cannon is now Sovereign Siege Engine",
      "No gameplay change: this is a display-text rename only, costs and effects are unchanged"
    ]
  },
  {
    createdAt: 1790702571173, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.22.2",
    title: "Seed Granary removed",
    why: "Seed Granary was a rarely-built Granary upgrade whose only effect -- a population-growth buff to nearby Granaries on the same island -- overlapped confusingly with the plain Granary's own growth bonus. It's been retired to simplify the manpower building line.",
    changes: [
      "Seed Granary can no longer be built or upgraded to",
      "Any Seed Granary from before this update automatically reverts to a plain Granary (Incubation Engine) the next time the server restarts -- no action needed, and its town keeps producing population growth as a Granary"
    ]
  },
  {
    createdAt: 1790450114921, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.22.3",
    title: "Manifest tree renamed to match offworld lore",
    why: "Manifest names still described local research or reused the same wording across unrelated cards. Every Manifest is now named for the specific offworld crew, module, charter, or dossier Coin actually buys.",
    changes: [
      "Renamed every Manifest tree entry to its final offworld name (for example: Agrarian Works is now Hyperfeed Seedstock Consignment; Aetheric Resonance is now Aether Resonance Core)",
      "Split the old Harbor Engineering entry: Harbor Exchange now unlocks from Trade Circuit Charter, while Aetherward Coil Module keeps Aether Wall",
      "Added a new Matterwright Retort Module entry, split out of the old Aether-Infused Synthesis node, which now unlocks Aether Retort",
      "No gameplay change beyond the Aether Retort split: this is a naming, classification, and lore pass -- prerequisites, costs, and unlock effects are otherwise unchanged"
    ]
  },
  {
    createdAt: 1790450114922, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.25.2",
    title: "Foundry renamed to Ore Refinery",
    why: "Manifest tree naming/lore pass: the Foundry already did exactly what the design calls Ore Refinery (doubling nearby Mine output) -- this was a missed rename, not a new building.",
    changes: [
      "Foundry is now called Ore Refinery everywhere: build menu, tooltip, tile-effect labels, and placement overlay",
      "No gameplay change: cost, tech requirement, and the +100% nearby Mine output effect are exactly the same as before"
    ]
  },
  {
    createdAt: 1790450114923, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.25.3",
    title: "Your House now starts on an Automated Fabrication Complex, not a Settlement",
    why: "Manifest tree lore pass: a House's first tile is offworld industrial hardware landing, not an abstract native settlement -- it grants the exact same starting Manpower and Coin income a Settlement did, so nothing about early-game pacing changes.",
    changes: [
      "A House's opening tile (and any respawn tile) is now an Automated Fabrication Complex instead of a SETTLEMENT-tier town",
      "The Automated Fabrication Complex grants the same 150 Manpower cap, 150/720-per-minute Manpower regen, and Coin income a starting Settlement always has",
      "No other town you settle is affected -- SETTLEMENT through METROPOLIS growth works exactly as before"
    ]
  },
  {
    createdAt: 1790450114924, // frozen, 1ms after the newest develop changelog entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.27.1",
    title: "Aether abilities now unlock from the right Manifest",
    why: "Some Aether abilities were gated on different techs in the menu than on the server, so a button could show as available and then be rejected (or the reverse). Every ability now reads one shared requirement.",
    changes: [
      "Reveal Empire and Reveal Empire Stats both require the Augury Office",
      "Aether Purge requires the Aether Resonance Core",
      "Survey Sweep now also reveals hidden Umbrite, alongside Titanium, Gems and towns",
      "Aether Wall's description now says it blocks crossing in both directions, which is how it already behaved",
      "Requirement hints now name the current Manifest (Augury Office, Echo-Reader Crew, Aether Resonance Core, Transposition Array Module)",
      "Aether EMP is now implemented: it disables every Ambaric Transformer a hostile empire holds near your target tile for 15 minutes, along with everything those Transformers power (Sky Docks, Resonance Grids, monuments)"
    ]
  },
  {
    createdAt: 1790450114925, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.27.1",
    title: "Soldiers in a battle can no longer disappear behind or inside anything",
    why: "Soldiers were drawn like any other solid object, so anything in front of them or covering their tile could hide the fight completely -- most visibly on farm tiles, where the whole battle happened hidden underneath the crop fields.",
    changes: [
      "In the 3D map, any part of a fighting soldier hidden behind something -- a farm's crops, a building, trees or a hill -- now shows as a solid outline in that player's colour, so a battle is always visible",
      "Soldiers fighting on a farm tile now stand on top of the crop fields instead of inside them"
    ]
  },
  {
    createdAt: 1790450114919, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.27.1",
    title: "We now measure where new players get stuck",
    why: "We couldn't tell whether new players gave up at the sign-in screen, before placing their first tile, or before ever meeting a rival -- so we couldn't tell which part of the first hour to fix.",
    changes: [
      "The sign-in screen records anonymously whether it was shown, which sign-in method was picked, and whether an account was created -- no email or name is attached",
      "For signed-in players we record first-hour milestones (spawning, first move, reaching 10 tiles, first border contact, first attack or diplomacy) and how long play sessions last, to improve onboarding"
    ]
  },
  {
    createdAt: 1790702571173, // frozen, 1ms after "We now measure where new players get stuck" -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.27.2",
    title: "Attacking into a defending flag's shield is no longer an unexplained bad result",
    why: "A Hold-mode muster flag can shield nearby tiles by matching your commitment, but nothing told you it had happened -- an attack could lose far worse than its preview suggested with no visible reason, since the shield itself was never shown ahead of the fight.",
    changes: [
      "When a shield actually matches your attack, the shielding flag's tile is now revealed to you even if you had no vision of it, so you can see what fought back",
      "In the 3D map, that flag's company now marches from the shield tile to the fight and disappears once the battle resolves -- the visible tell that a shield mattered"
    ]
  },
  {
    createdAt: 1790450114921, // frozen, 1ms after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.28.1",
    title: "Development slots no longer get stuck as busy",
    why: "A settlement that failed to finish could keep holding a development slot forever without showing in the Development panel, so the panel read 3/3 while only one slot was actually working and the rest of the queue sat on Waiting.",
    changes: [
      "The slots-used count now always matches the settlements and constructions actually in progress",
      "A settlement that is more than a minute past its finish time is now completed automatically, freeing its slot"
    ]
  },
  {
    createdAt: 1790450114926, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.28.1",
    title: "Retort Transmutation now actually recasts tiles, and can target Umbrite",
    why: "Retort Transmutation had a full menu, cooldown, and cast animation, but no server ever processed the command -- it was missing from three separate command-registration lists (the durable-command schema, and two gateway allowlists), so every cast silently did nothing. Umbrite was also missing as a recast target even though the ability's own description already promised it.",
    changes: [
      "Retort Transmutation now actually rewrites the target tile's resource, gated on the Matterwright Retort Module and observatory range/cooldown like every other Aether ability",
      "Added a fourth recast target, Umbrite, alongside Food, Titanium, and Crystal",
      "Fixed the ability's requirement hint, which still said \"Requires Aether-Infused Synthesis\" from before the Manifest split"
    ]
  },
  {
    createdAt: 1790450114927, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.28.2",
    title: "Your Automated Fabrication Complex is now visible on the map",
    why: "Every House's opening tile is an Automated Fabrication Complex, but it rendered as plain owned territory with no building at all -- no way to tell it apart from an empty tile at a glance.",
    changes: [
      "True-3D renderer: your AFC now shows its full reactor model, with a docked module cartridge appearing in its socket ring for each Manifest module you've commissioned so far (12 of the eventual module families have art today; the rest dock invisibly for now, the same as before this change)",
      "2D canvas renderer (accessibility fallback): the AFC tile shows a distinct brass-rimmed reactor glyph with a pulsing aether core; it does not show individual docked modules the way the 3D renderer does, since it has no equivalent per-instance model system"
    ]
  },
  {
    createdAt: 1790450114928, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.28.3",
    title: "See what's docked on your AFC",
    why: "tile.afc.modules already tracked every module you've commissioned, but tapping the tile only ever showed the generic \"Automated Fabrication Complex\" title -- no way to see what was actually docked without cross-referencing the tech tree from memory.",
    changes: [
      "Tapping an AFC now lists every module you've commissioned, grouped under Economy, Manpower, War, and Aether -- regardless of whether that module has 3D or 2D map art yet",
      "An inactive AFC shows a \"Dormant\" banner over its module list, rather than hiding the list -- modules stay visible even when they're not currently doing anything"
    ]
  },
  {
    createdAt: 1790450114929, // frozen, 1ms after the newest existing entry
    introducedIn: "2026.09.29.1",
    title: "Empires settled before Automated Fabrication Complexes existed now get one",
    why: "Only a fresh spawn or a full elimination-respawn ever created an AFC -- an empire that settled before AFCs shipped had no way to ever get one, and so no way to commission Manifest modules at all.",
    changes: [
      "If your empire has a settled tile but no AFC, you'll be granted one on free land near your existing settlement the next time you connect -- your settlement itself is untouched"
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
    createdAt: 1790866856971, // frozen Date.now() value for this release
    introducedIn: "2026.10.01.2",
    title: "Cleaner landing sites for your Fabrication Complex",
    why: "A new empire's Automated Fabrication Complex could land hemmed in by water, mountains or thick forest, leaving a cramped and slow start.",
    changes: [
      "Your Fabrication Complex now always lands on a tile with no water on any of its 8 surrounding tiles",
      "Any mountains on the landing tile's 8 neighbours are flattened into open land when it lands",
      "Forest is cleared from the landing tile and all 8 neighbours, so the area around your Complex is quick to claim and settle and doesn't block your sight"
    ]
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD,
  ...CLIENT_CHANGELOG_ENTRIES_NEW_PLAYER_EXPERIENCE,
  ...CLIENT_CHANGELOG_ENTRIES_RECENT,
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_SEPT_24_26,
  ...CLIENT_CHANGELOG_ENTRIES_TERRAIN,
  ...CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS
];
