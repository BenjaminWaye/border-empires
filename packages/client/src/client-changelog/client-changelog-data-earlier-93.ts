import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Historical record only -- deliberately left unreferenced by
// client-changelog-data.ts / client-changelog-recent-groups.ts. Entries
// below aged out of the "keeps only the latest week" window (client-
// changelog.test.ts) once newer entries pushed the 6-day cutoff past them;
// moved here rather than deleted, per the maintenance note at the top of
// client-changelog-data.ts.
export const CLIENT_CHANGELOG_ENTRIES_EARLIER_93: ClientChangelogEntry[] = [
  {
    createdAt: 1789933799389,
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
    createdAt: 1789933799388,
    introducedIn: "2026.09.26.1",
    title: "Older towns now show their real terrain type instead of always reading Fertile Town",
    why: "Towns founded before terrain profiles shipped have no stored terrain type, and the client fell back to Fertile Town even on sand or tundra, which contradicted the income the server actually paid them.",
    changes: [
      "Town cards, tile titles and capture popups now work out the terrain type of older towns from the map (Trade Town on sand, Tundra Town on tundra)",
      "The town debug download no longer reports a stale base gold of 2 per minute for towns whose server record lacks one"
    ]
  },
  {
    createdAt: 1789933799388,
    introducedIn: "2026.09.26.2",
    title: "A tile's reach-border status now clears reliably instead of getting stuck showing an old owner",
    why: "The gateway's outgoing tile-delta encoding converted several fields (like ownership) from \"unset\" to an explicit null so the change would survive JSON.stringify and actually reach the client, but reachOwnerId was missing from that list. When a player's reach-border anchor covering a tile was destroyed and reachOwnerId became unset, the field was silently dropped from the message instead of being sent as null, so the client kept whatever owner it had last seen -- a tile could keep showing as inside someone's reach (or blocking an EXPAND) long after that reach was actually gone.",
    changes: [
      "Tiles whose reach-border coverage is removed now reliably clear on the client instead of keeping a stale reach owner"
    ]
  },
  {
    createdAt: 1789933799387,
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
    createdAt: 1789933799380,
    introducedIn: "2026.09.20.4",
    title: "Coastal towns now stack with their terrain",
    why: "Coastal identity used to replace a town's terrain, which made every coastal town desert-only and could reduce manpower despite a coast being intended as a constrained, high-output location.",
    changes: [
      "Coastal Town is now a separate +20% gold, manpower-capacity, and manpower-regeneration modifier that stacks with Trade, Tundra, or Fertile terrain at every population tier",
      "Every town now names its character beneath the town name; Gold and Manpower cards show short, separate terrain and coastal modifier lines, while neutral fertile terrain shows no zero-effect text"
    ]
  },
  {
    createdAt: 1789933799389,
    introducedIn: "2026.09.26.2",
    title: "Rivers run along tile borders, and new grassland and marsh terrain",
    why: "Rivers were drawn as a thin blue line painted over the middle of tiles, plains all looked like dry golden grass, and marshes mostly lined the ocean coast.",
    changes: [
      "From the next season, rivers flow along the borders between tiles in a real channel cut into the land, with muddy banks and moving water, so both tiles beside a river touch it. Towns placed along rivers now sit on either bank",
      "From the next season, grass away from the tropics is bright green Plains, and the tropical middle of the map is Grassland",
      "From the next season, marshes form around inland lakes and in inland wetlands instead of along the ocean coast",
      "Plains, Grassland and Marsh are looks only: resources, farming and town terrain work the same as before. The current season's map does not change"
    ]
  },
  {
    createdAt: 1789933799390,
    introducedIn: "2026.09.26.3",
    title: "Tile names match the terrain you see",
    why: "Jungle, marsh, snow and plains tiles were drawn on the map but named Grass or Tundra when you selected them.",
    changes: ["Selecting a tile now names it Jungle, Marsh, Snow, Plains or Grassland when that's what the map shows. This is only the name; the terrain works the same as before"]
  },
  {
    createdAt: 1789933799384,
    introducedIn: "2026.09.25.2",
    title: "Activity now remembers the milestones your empire reached while you were away",
    why: "The Activity dashboard could already show territory, battles, manpower, and raided gold, but a completed building, captured town, or waystation reward could disappear from the story unless you happened to be watching live.",
    changes: [
      "Activity now retains waystation rewards for 24 hours, including their exact resource-slot, population, vision, or technology effect",
      "Town captures and losses show the town's aftermath, and completed buildings show their one-off gold or population reward when one applies",
      "Every new milestone card has a Center action so you can jump straight to where it happened"
    ]
  },
  {
    createdAt: 1789933799381,
    introducedIn: "2026.09.23.1",
    title: "Space View gets a flat strategic map of the whole galaxy, with the Court at the centre",
    why: "Space View only had a 3D orbit view, so there was no way to read at a glance where you sit in the galaxy, who your neighbours are, or how far you are from the centre of power. Territory was also invisible as territory: every system was just a separate dot.",
    changes: [
      "Zoom out from your system past the wide galaxy view -- or press the new Strategic Map button in Space View -- to see a flat 2D map of every system",
      "Systems connect to their real nearest neighbours; a Duke's adjacent systems merge into one bigger territory patch instead of separate dots",
      "The Court is drawn as a fixed landmark at the centre and is not on any travel route",
      "Only your own, contested, and threatened systems are labelled, so the map stays readable with hundreds of systems; click any system to fly in on it",
      "Any raid that gets through to an undefended Sector now costs a flat 20 Stability, whatever size the attacking fleet is, so a Sector takes five hits to fall into contestation instead of being wiped by one big raid"
    ]
  },
  {
    createdAt: 1789933799387,
    introducedIn: "2026.09.25.1",
    title: "MARCH flags take the straightest route to their target",
    why: "A MARCH flag picked whichever next tile left the fewest tiles to the target, ignoring how far the company had to march to get there, so it could wander down a long stretch of your own land to reach a fight near the target instead of heading straight for it.",
    changes: [
      "MARCH now counts the whole route from the flag to the target and follows the straightest one, preferring tiles on the direct line from the flag. Pick a different target if you want it to take another way",
      "When two routes are equally short, MARCH now attacks enemy frontier ground rather than settled ground"
    ]
  },
  {
    createdAt: 1789933799384,
    introducedIn: "2026.09.25.1",
    title: "Press your name in the top bar to open your profile",
    why: "Other players' names already opened their profile, but your own name in the top toolbar was plain text.",
    changes: [
      "The Player chip in the top toolbar is now a button that opens your profile screen"
    ]
  },
  {
    createdAt: 1789933799383,
    introducedIn: "2026.09.24.2",
    title: "Farms have a new look",
    why: "Farm tiles were drawn as a procedural barley field. They now use a modelled farm tile with crop rows, a silo and a hay bale that is easier to read at a glance.",
    changes: [
      "Every farm resource tile in the 3D map now shows a low-poly farm with golden crop rows, a silo and a hay bale",
      "Each farm is turned a random 90 degrees so neighbouring farms do not look copy-pasted",
      "The 2D fallback renderer is unchanged"
    ]
  },
  {
    createdAt: 1789933799383,
    introducedIn: "2026.09.25.1",
    title: "Muster soldiers now stand at ease on a frontier tile while it's being claimed",
    why: "When a muster flag's company attacked or expanded onto a frontier tile, the soldiers vanished the moment their march ended, leaving the claim timer running on an empty tile.",
    changes: [
      "True-3D renderer: after marching out, the company steps onto the target tile and stands at ease (idle pose) until the tile's claim timer finishes",
      "2D canvas renderer (accessibility fallback): unchanged -- it has never drawn marching soldiers, so there is nothing to keep on the tile"
    ]
  },
  {
    createdAt: 1789933799389,
    introducedIn: "2026.09.26.2",
    title: "Waystations can now grant gold or manpower, and never give nothing",
    why: "A waystation that rolled a free technology gave you nothing once you already knew every first-tier technology, wasting its one-time activation.",
    changes: [
      "Waystations can now grant gold: 25, 50 or (rarely) 100. That is a big boost early in the season and a smaller one later",
      "Waystations can now grant 1,000 manpower, which can take you above your manpower cap. Regeneration pauses until you spend back below the cap",
      "If a waystation rolls a free technology and you already know every first-tier technology, you get gold instead"
    ]
  }
];
