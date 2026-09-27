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
    createdAt: 1789933799389, // frozen, 1ms after "Older towns now show their real terrain type..." -- the newest entry once this merged with develop
    introducedIn: "2026.09.26.3",
    title: "Build buttons now show what a building costs to keep running, not just what it costs to build",
    why: "The build menu only ever showed the one-time gold/manpower build cost, never the ongoing upkeep (a permanent resource slot, or a synthesizer's gold/day) -- so you couldn't see what a building would cost to run before committing to it. Airport's button also claimed a fabricated \"36 crystal/day\" drain that doesn't exist anywhere in the simulation, Relay Beacon's info popup claimed a \"5 gold/m\" upkeep that doesn't exist either, and the Observatory's real rule (each additional one you own costs progressively more CRYSTAL) was only ever shown on the build button -- the info popup and the dormant-structure warning both still claimed a flat 1, understating the true cost of a 2nd or 3rd Observatory.",
    changes: [
      "Every build button now shows a labeled \"Upkeep: ...\" line for its real ongoing cost -- a resource slot requirement, a synthesizer's gold/day drain, or both",
      "Removed Airport's fabricated \"36 crystal/day\" upkeep claim (its real ongoing cost is the 3 CRYSTAL slots already shown) and Relay Beacon's false \"5 gold/m\" upkeep claim from its info popup",
      "The Observatory's progressive CRYSTAL cost (1st = 1, 2nd = 2, 3rd = 3, and so on) now shows correctly everywhere it's displayed: the build button, the info popup, and a dormant Observatory's warning line"
    ]
  },
  {
    createdAt: 1789933799387, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.26.1",
    title: "Space View's top bar no longer scrolls sideways on phones",
    why: "On phones the Space View tab bar (Strategic Map/Senate/Court/Log/Settings) squeezed into a horizontally-scrolling strip, so buttons could scroll out of view and the row read as broken.",
    changes: [
      "On phones, Space View's tabs now sit in a fixed bar at the bottom of the screen, in the same place and style as the season HUD's bottom tab bar, instead of scrolling sideways along the top",
      "The top bar now only shows your Influence and Production while on a phone"
    ]
  },
  {
    createdAt: 1789933799385,
    introducedIn: "2026.09.25.2",
    title: "Login shows a download progress bar instead of freezing",
    why: "The last login step, \"Packaging your session for delivery\", could sit unchanged for ten seconds or more on phones while your world downloaded and loaded, with the elapsed-seconds counter stuck.",
    changes: [
      "While your world downloads, the login screen shows a progress bar with how much has arrived and about how long is left",
      "Once the download finishes the bar fills and it says \"Building your map...\" with an estimate of the remaining wait, instead of looking stuck",
      "The time estimate learns how fast your device builds the map, so it gets more accurate after your first login"
    ]
  },
  {
    createdAt: 1789933799386,
    introducedIn: "2026.09.25.3",
    title: "AI empires no longer starve their own Relay Beacon builds while staging an attack",
    why: "An AI whose muster flag kept refilling from its manpower pool sat near zero manpower, and its war reserve was counted on top of the manpower already staged in the flag. It could never afford the Relay Beacon it needed to extend its reach, so it stalled for hours next to open land.",
    changes: [
      "Manpower an AI has already staged in its muster flags now counts toward its war reserve, so a full flag no longer blocks its builds",
      "An AI's muster flags now leave enough manpower in the pool for one Relay Beacon route (a settle plus the beacon build), and the AI may spend that on builds even while its war reserve is unmet",
      "Human players' muster flags are unchanged"
    ]
  },
  {
    createdAt: 1789933799383,
    introducedIn: "2026.09.25.1",
    title: "Way stations now activate when your town's reach grows over them",
    why: "Settling a town extends your border over nearby neutral land for free, but that path skipped way station activation, so a way station inside the new reach became yours as frontier with no reward and no popup.",
    changes: [
      "A dormant way station (or watchtower) inside a newly claimed reach area now activates immediately and shows its reward popup"
    ]
  },
  {
    createdAt: 1789933799382,
    introducedIn: "2026.09.24.1",
    title: "Space View: press your planet to build, defend it from Wardens, and work against the Court",
    why: "Space View was a map with no clear reason to open it. Dukes now have planets to develop, ships to send, something hunting them at the start, and a shared goal: the fall of the Court.",
    changes: [
      "Press one of your planets to open its panel: its Stability, its ships, and everything it can build. Each planet has its own build slot, so a Duke with two planets builds two things at once",
      "Ships are how you give orders: press a Fighter to send it raiding a system you have surveyed, or a Probe to survey one. Probes are used up, then stay in orbit and keep you updated on that system (up to 3 at once)",
      "Every planet has 2 to 4 bodies in orbit, coloured by kind. Build a Gas Harvester on a gas giant or a Mining Station on an asteroid belt for more Production, or a Cryo Refinery on an ice moon to heal that planet. The first development in each system is free; each extra one costs 1 Influence a Cycle",
      "Wardens are hardest at the start: a fixed number of attacks a Cycle is shared between every planet in the galaxy, so a lone planet takes them all and each new planet eases everyone's share. A Fighter stationed at a planet repels an attack for 20 hull damage; with none, that planet loses a flat 20 Stability and takes five hits to be contested. Each attack is announced first",
      "New Dukes get a one-time offer from the Court: 30 days of protection from Wardens in return for 90 days without Move Against the Court",
      "A list at the top of Space View says what needs you right now, and three meters under it show your Stability, your Domain Weight (your score for the throne) and Court Strength (the shared countdown to the Court falling). Hover any of them for a plain explanation",
      "The Court tab holds Move Against the Court: wager Influence to weaken the Court and raise your Domain Weight, once per Cycle. A Log tab lists what happened while you were away",
      "A raid that gets through now always costs a flat 20 Stability, whatever size the fleet. The Contest vote is gone from the Senate: a Sector is contested when its Stability reaches 0",
      "Influence income and upkeep were rebalanced so a single planet no longer runs at a loss, and Stability heals whenever your Influence is zero or above. Production is now a daily rate per planet instead of a weekly wallet",
      "The Manage Planet button is gone from Space View, since you now press your planet to manage it. Planet naming still happens in the welcome letter",
      "Every Space View panel (Duke, Senate, Settings) now has a close button and also closes when you press outside it or hit Escape. On phones the panels slide up as a bottom sheet so the map stays visible, the top bar scrolls sideways instead of wrapping, and the attention list shrinks to fit"
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
    createdAt: 1789933799388, // frozen, 1ms after the newest existing entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.26.1",
    title: "Older towns now show their real terrain type instead of always reading Fertile Town",
    why: "Towns founded before terrain profiles shipped have no stored terrain type, and the client fell back to Fertile Town even on sand or tundra, which contradicted the income the server actually paid them.",
    changes: [
      "Town cards, tile titles and capture popups now work out the terrain type of older towns from the map (Trade Town on sand, Tundra Town on tundra)",
      "The town debug download no longer reports a stale base gold of 2 per minute for towns whose server record lacks one"
    ]
  },
  {
    createdAt: 1790450114911, // frozen, 1ms after the previous manifest-rework entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.21.2",
    title: "Gold is now called Coin",
    why: "\"Gold\" never fit a game with no gold resource tiles or gold-colored anything -- it was just the name of the currency you earn from towns and docks. Renamed the display text to Coin throughout the game; nothing about how it's earned or spent changed.",
    changes: [
      "Every player-facing mention of Gold (HUD, build costs, tech costs, tooltips, discovery tips, alerts, and activity feed) now says Coin instead",
      "No gameplay change: amounts, costs, and income formulas are exactly the same as before"
    ]
  },
  {
    createdAt: 1790450114912, // frozen, 1ms after the previous manifest-rework entry -- keeps the "latest week" rolling window from dropping these
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
    createdAt: 1790450114913, // frozen, 1ms after the previous manifest-rework entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.22.2",
    title: "Seed Granary removed",
    why: "Seed Granary was a rarely-built Granary upgrade whose only effect -- a population-growth buff to nearby Granaries on the same island -- overlapped confusingly with the plain Granary's own growth bonus. It's been retired to simplify the manpower building line.",
    changes: [
      "Seed Granary can no longer be built or upgraded to",
      "Any Seed Granary from before this update automatically reverts to a plain Granary (Incubation Engine) the next time the server restarts -- no action needed, and its town keeps producing population growth as a Granary"
    ]
  },
  {
    createdAt: 1790450114914, // frozen, 1ms after the previous manifest-rework entry -- keeps the "latest week" rolling window from dropping these
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
    createdAt: 1790450114915, // frozen, 1ms after the previous manifest-rework entry -- keeps the "latest week" rolling window from dropping these
    introducedIn: "2026.09.25.2",
    title: "Foundry renamed to Ore Refinery",
    why: "Manifest tree naming/lore pass: the Foundry already did exactly what the design calls Ore Refinery (doubling nearby Mine output) -- this was a missed rename, not a new building.",
    changes: [
      "Foundry is now called Ore Refinery everywhere: build menu, tooltip, tile-effect labels, and placement overlay",
      "No gameplay change: cost, tech requirement, and the +100% nearby Mine output effect are exactly the same as before"
    ]
  },
  {
    createdAt: 1790450114916, // frozen, 1ms after the previous manifest-rework entry -- keeps the "latest week" rolling window from dropping these
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
    createdAt: 1790450114917, // frozen, 1ms after the previous manifest-rework entry -- keeps the "latest week" rolling window from dropping these
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
  }
];
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  ...CLIENT_CHANGELOG_ENTRIES_ACTIVITY_DASHBOARD,
  ...CLIENT_CHANGELOG_ENTRIES_RECENT,
  ...RECENT_CLIENT_CHANGELOG_ENTRIES,
  ...CLIENT_CHANGELOG_ENTRIES_TERRAIN,
  ...CLIENT_CHANGELOG_ENTRIES_FEATURE_GROUPS
];
