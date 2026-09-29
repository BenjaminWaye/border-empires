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
    createdAt: 1790450114908,
    introducedIn: "2026.09.26.1",
    title: "Planets you won in older seasons reappear in Space View",
    why: "Space View only looked at the newest 12 season archives, so once 12 newer seasons had ended, a Planet you won earlier vanished and the Space View button never appeared.",
    changes: [
      "Every season archive now counts toward the galaxy, so older won Planets are back on the map and in the panel",
      "The archives screen still shows only the newest 12 seasons"
    ]
  },
  {
    createdAt: 1790450114909,
    introducedIn: "2026.09.26.2",
    title: "Strategic map: pan, zoom, jump to the Court, and info on other systems",
    why: "The flat galaxy map could not be moved or zoomed, the Court was hard to find, and pressing a system that was not yours did nothing.",
    changes: [
      "Drag to pan and use the wheel or pinch to zoom the strategic map (1x to 6x); the wheel no longer leaves the map",
      "The Court button recentres on the Court landmark and opens the Court tab; pressing the landmark opens it too",
      "Pressing a system that is not yours, including an Unknown System, opens what is known about it and how to learn more",
      "A Fighter now costs 40 Production (was 80); a Probe stays at 25"
    ]
  },
  {
    createdAt: 1790450114910,
    introducedIn: "2026.09.26.3",
    title: "Convergence: when the Court falls, the top Duke takes the throne",
    why: "The Duke game had no ending: Court Strength could reach zero and nothing happened.",
    changes: [
      "When the Court falls, the Duke with the highest Domain Weight takes the throne and the era is recorded in a Hall of Fame (newest 50 kept)",
      "A new era begins with the Court back at full strength; planets, ships, developments and Stability carry over",
      "The Court tab shows the current era, whether you hold the throne, and the Hall of Fame",
      "Every Duke gets a Log line when an era ends"
    ]
  },
  {
    createdAt: 1790450114911, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.24.1",
    title: "No more gold cap, and your manpower bar now shows when it'll be full",
    why: "The gold storage cap (24h of income) punished players who couldn't log in fast enough to spend it, the same problem SHARD's storage was already exempted from. Separately, with no turns or shared clock, the only way to know if your manpower pool -- which regenerates continuously -- was worth checking on was to open the game and look.",
    changes: [
      "Gold has no storage cap any more -- it accrues without limit, same as SHARD",
      "Offline gold/resource accrual now covers up to 24 hours away (up from 12), so a longer break between visits doesn't leave income on the table",
      "Provincial Governors, Treasury State, Enduring Realm, and Golden Hegemony now boost your real town and dock gold income instead of a storage cap that no longer exists",
      "The manpower panel now shows \"Manpower full in Xh Ym\" (or \"Regen paused\" during a Titanium Levy freeze) so you know when it's worth coming back",
      "New \"Manpower Full\" email alert (with its own toggle in Email Notifications) lets you know once your manpower has filled up while you were away"
    ]
  },
  {
    createdAt: 1790450114912, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.24.2",
    title: "Structure build times now follow their manpower cost",
    why: "Flat build times let a big empire finish everything about as fast as a small one, which turned building into clicking rather than a real decision -- and let players race ahead of anyone who logs in less often. Manpower cost already grows as you build more, so time now grows with it too: 100 manpower takes 1 hour, scaling with whatever else changes that cost (tech, domains, Quartermaster's Office).",
    changes: [
      "Every structure's build time is now its manpower cost x 36 seconds (100 manpower = 1 hour), replacing the old flat per-structure timer -- this doesn't touch Settle, Expand, attacks, or muster, which keep their existing timers",
      "The first 5 Relay Beacons you own cost a discounted flat 30 minutes/50 manpower -- they came down with the landing party, pre-fab. From the 6th, a beacon costs a flat 100 manpower, about an hour to build",
      "Siege Battery/Tower/Dread Tower now cost 60/120/240 manpower to build (was 60 at every tier), so higher siege tiers take longer to raise, matching how the fort ladder already scales",
      "Fixed the Titanium Bastion/Thunder Bastion/Siege Tower/Dread Tower cost tooltips, which showed stale hardcoded numbers (including gold costs that haven't been charged in a long time) instead of each tier's real cost"
    ]
  },
  {
    createdAt: 1790450114913, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.25.1",
    title: "Attacking a fort or settled tile now loses a fixed amount of manpower",
    why: "Manpower lost attacking a fort or settled tile used to be a random draw within a range for that fort tier, the same whether you won or lost. It's now simply what you committed to the attack -- easier to plan around, and the foundation for a future \"commit more, win more\" attack option.",
    changes: [
      "Attacking a fort or settled tile now loses exactly the manpower you committed to the attack, win or lose, instead of a random draw within that fort tier's old range",
      "Barbarian raids and claiming FRONTIER land are unaffected -- they never used that range"
    ]
  },
  {
    createdAt: 1790450114914, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.25.2",
    title: "Weapons Factory manpower cost no longer rises with how many you own",
    why: "Each Titanium/Umbrite Weapons Factory cost 15% more manpower than the last one you owned, compounding without limit -- meant to make a large manpower pool matter for building, but a large pool already matters via cost/build-time scaling elsewhere, so this just made specializing in war industry needlessly expensive late-game.",
    changes: ["Titanium and Umbrite Weapons Factory now cost a flat 100 manpower per copy, however many you already own"]
  },
  {
    createdAt: 1790450114915, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.25.3",
    title: "A muster flag with a march order now has its own Attack tab to choose how hard to commit",
    why: "Attacking a fort or settled tile always committed exactly the required minimum, so there was no way to spend extra manpower for better odds even when you had plenty to spare.",
    changes: [
      "Any tile with your own muster flag now shows an Attack tab: a slider from the target's required manpower up to your whole manpower cap, three quick presets (Normal/Extra/Double), and a live win-chance readout",
      "Committing more than the minimum still costs exactly what you commit if the attack is lost or won, but raises your odds -- \"Save\" applies it to whatever this flag's next march/advance attack fires"
    ]
  },
  {
    createdAt: 1790450114916, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.26.1",
    title: "Muster flags no longer have their own manpower ceiling",
    why: "A muster flag used to stop filling at 10% of your manpower cap (plus whatever \"Expand Capacity\" presses you'd bought), well below your whole pool -- so the new Attack tab's commit slider (which goes up to your full manpower cap) was often aspirational, since the flag itself couldn't actually hold that much.",
    changes: [
      "A muster flag now fills straight to your whole manpower pool, with no smaller cap of its own",
      "\"Expand Capacity\" is gone from the tile menu -- there's nothing left to expand into"
    ]
  },
  {
    createdAt: 1790450114917, // frozen, just after the newest develop entry so the latest-week window keeps its older entries
    introducedIn: "2026.09.26.2",
    title: "A Defend-mode muster flag now shields nearby tiles from attack",
    why: "Attacks always fought the target tile's own defense alone, so a flag full of staged manpower did nothing to protect the ground around it -- there was no way to actually defend a front with mustered strength, only to attack with it.",
    changes: [
      "A muster flag in Hold mode now shields every tile within 3 tiles of itself: an incoming attack there is automatically matched by the flag's own staged manpower, up to what it holds, raising the defender's odds",
      "Any muster flag also shields its own tile this way, even in Advance or March mode, so an attacking flag isn't a free target",
      "Both sides lose the matched manpower, win or lose -- attacking straight into a full shield is poor value; flanking around it is the better play",
      "If more than one of your flags could shield the same tile, only the largest one counts -- shields don't stack"
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
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD,
  ...CLIENT_CHANGELOG_ENTRIES_RECENT,
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_TERRAIN,
  ...CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS
];
