// Older client-changelog entries, split out of client-changelog-data.ts to keep
// that file under the repo's 500-line cap (see the comment at its top). Same
// shape and rules apply here: unordered, append-only, frozen createdAt literals.
// client-changelog-data.ts merges this array into CLIENT_CHANGELOG_ENTRIES.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER: ClientChangelogEntry[] = [
  {
    createdAt: 1786165552000, // 2026.08.08.1
    introducedIn: "2026.08.08.1",
    title: "Wooden Fort renamed to Palisade",
    why: "\"Wooden Fort\" was a mouthful next to the ladder's other short names (Fort, Titanium Bastion, Thunder Bastion); Palisade is shorter and reads as the entry-tier defensive structure it is.",
    changes: [
      "The lightweight border/dock fortification is now called \"Palisade\" everywhere in the UI — tile menu, economy panel, and build actions. No change to its cost, defense bonus, or build time."
    ]
  },
  {
    createdAt: 1786100000000, // 2026-08-07
    introducedIn: "next",
    title: "Incubation Engine no longer double-dips on population growth; fixed wrong/missing building icons and a 288x gold display bug",
    why: "Incubation Engine (Granary) was granting both its intended instant +10,000 population burst on completion AND an old ongoing +15% population growth multiplier at the same time — the redesign was meant to replace the old mechanic, not stack on top of it. Separately, Ambaric Tower's detail page and map icon were showing the Radar System's art, Incubation Engine's icon still used the old Granary art instead of its own dedicated art, and 5 Manpower buildings (Quartermaster's Office, Logistics Guild, Assembly Works, Population Bureau, The Iron Levy) had no icon at all on their detail pages. Dock income also displayed 288x too high in one fallback path (a leftover pre-rescope number, same bug class as several other tooltips fixed recently).",
    changes: [
      "Incubation Engine's ongoing +15% population growth bonus has been removed — it now only grants its instant one-time population burst, as intended.",
      "Ambaric Tower and Incubation Engine now show their own dedicated artwork on both the map and their detail pages, instead of Radar System's/the old Granary's.",
      "Quartermaster's Office, Logistics Guild, Assembly Works, Population Bureau, and The Iron Levy now show their artwork on their detail pages.",
      "Ancillary Factory no longer requires a CRYSTAL slot to build — it now only needs FOOD, matching its Manpower-branch role.",
      "Ancillary Factory and Quartermaster's Office now correctly show 0-gold costs as blank instead of \"0 gold\".",
      "Fixed a dock-income display bug that could show 288x the real value when the server hadn't yet sent live dock data."
    ]
  },
  {
    createdAt: 1786100500000, // 2026-08-07
    introducedIn: "clockwork-stipend-slot-grant",
    title: "Clockwork Stipend now grants a free logistics slot instead of a steady resource trickle",
    why: "The empire no longer earns passive per-minute resource income — iron, supply, and crystal are now slot-based. So Clockwork Stipend's old 0.2/min (or 0.1/min crystal) trickle no longer had a place in the economy. It now grants one free logistics slot for the resource you choose, effectively making that resource exempt from land-use pressure.",
    changes: [
      "Choosing Clockwork Stipend now locks in one free logistics slot for iron, supply, or crystal instead of a per-minute trickle.",
      "The free slot is purely additive — it counts on top of your tile-based supply and applies everywhere slots are read (live economy, tile detail, and reconnect snapshots).",
      "Your choice is still locked forever the moment you confirm the domain, same as before."
    ]
  },
  {
    createdAt: 1786101000000, // 2026-08-07
    introducedIn: "fix-attack-reveal-scan",
    title: "Faster attack resolution",
    why: "Each ATTACK capture was building a (2r+1)² tile-delta batch to reveal fog-of-war, even though the target tile is always adjacent to the attacker's existing territory — meaning nearly every tile in the batch was already visible. With vision-radius tech bonuses, this batch could reach 361+ tiles and block the server event loop for 500ms+, causing action-accept-timeouts on ATTACK commands.",
    changes: [
      "The capture-reveal scan now skips already-visible tiles for ATTACK, matching EXPAND behavior.",
      "Attack command acceptance is faster and more reliable."
    ]
  },
  {
    createdAt: 1786174507000,
    introducedIn: "resource-reveal-settle-and-ribbon",
    title: "Fixed: settling near a hidden resource revealed it early, and the toolbar showed hidden resource types",
    why: "Iron, Supply, and Crystal are supposed to stay hidden until you've researched the tech that reveals them. That masking was already fixed for the streaming map view and for what you see on login, but settling next to a hidden resource (or capturing territory near one) still exposed it instantly through a separate reveal path. The toolbar's resource ribbon also always showed all four resource pills regardless of tech.",
    changes: [
      "Settling, expanding, or capturing near an unrevealed Iron/Supply/Crystal tile no longer exposes its resource type early.",
      "The toolbar's resource ribbon now hides the Iron/Crystal/Supply pill entirely until you've researched the tech that reveals it."
    ]
  },
  {
    createdAt: 1786174507001,
    introducedIn: "resource-reveal-economy-panel",
    title: "Fixed: the detailed economy screen still listed hidden resources",
    why: "The ribbon fix hid Iron/Crystal/Supply from the toolbar, but the detailed economy screen (opened by tapping a resource, or from the panel nav) still showed a card for each one with a \"No access to this resource yet\" label — still revealing that the category exists before you've earned it.",
    changes: [
      "The economy screen's summary cards and detail breakdowns now hide Iron/Crystal/Supply entirely until revealed, instead of showing an empty placeholder card."
    ]
  },
  {
    createdAt: 1786174507002,
    introducedIn: "weapons-workshop",
    title: "New: Weapons Workshop",
    why: "The War branch needed a building that lets a town specialize for combat, and a new tech to reach it early.",
    changes: [
      "New building: Weapons Workshop. Forges Iron and Supply into titanium-alloy plating and charged energy blades, granting a small empire-wide attack and defense boost (+3% each, per copy owned).",
      "No per-town limit on Weapons Workshop — build as many as you like in one town to raise a dedicated military city.",
      "New tech: Weapons Forging (War branch), unlocked by researching both Ironclad Masonry and Tanner's Craft.",
      "Mintworks and Ancillary Factory also lost their one-per-town limit, so towns can specialize with multiples of either."
    ]
  },
  {
    createdAt: 1786174507003,
    introducedIn: "tech-tag-consistency",
    title: "Fixed: tech tags were inconsistent between the tech-tree card and the tech detail screen",
    why: "The tech-tree card and the tech detail screen could show a different set of unlock tags for the same tech, resource-reveal effects (like 'Reveals Crystal') never got a tag at all, and some techs showed only a redundant yellow text summary instead of tags.",
    changes: [
      "The tech-tree card and the tech detail screen now always show the exact same tags for a tech.",
      "Resource-reveal effects (Reveals Food/Iron/Crystal/Supply) now show as their own tag, everywhere a tech's unlocks are shown.",
      "Removed the separate yellow 'Unlocks X' text summary — tags are now the only way a tech's unlocks are shown."
    ]
  },
  {
    createdAt: 1786174507004,
    introducedIn: "next",
    title: "Converters can now be pointed either direction: Refine or Sell off",
    why: "Fur Works, Iron Works, and Aether Condenser (and their Advanced tiers) each had one job: turn gold into a resource slot. Now every one of them can point either way in place. Refine works as before — gold upkeep manufactures 1 slot of its resource. Sell off runs the building in reverse: it consumes that same slot and pays out gold each day instead, with no gold upkeep while selling off. The old 1-per-empire limit on these buildings is gone entirely — build as many as you can afford in whichever direction your economy needs. A captured converter also can't be sold off immediately — it starts mode-locked for the same 60 minutes as a fresh flip, so capturing one isn't an instant payday.",
    changes: [
      "New building names: Fur Synthesizer -> Fur Works, Ironworks -> Iron Works (Aether Condenser is unchanged — it already read as direction-neutral).",
      "The structure panel shows a converter's current mode with a flip control and remaining cooldown.",
      "Flipping a converter's mode has a 60-minute cooldown, and a freshly built or freshly captured converter starts locked for the same 60 minutes.",
      "Sell off mode: no gold upkeep; pays 8 gold/day for Iron Works and Fur Works, 10 gold/day for Aether Condenser (Advanced tiers: 12 / 15 gold/day).",
      "The 1-per-empire cap on these buildings is removed — build and run as many as you want, in either mode."
    ]
  },
  {
    createdAt: 1786174511000, // 2026-08-08
    introducedIn: "expand-ui-multi-waypoint",
    title: "Expand manpower now shows as reserved, queue numbering fixed, and waypoints can be queued",
    why: "Manpower for a queued or in-progress Expand wasn't shown as spent until the server resolved it, so the displayed manpower total looked available when it was already committed. The queue badge on a currently-executing action also showed \"1\", which read as \"next in line\" rather than \"in progress\". And only one waypoint could be set at a time, so a multi-hop trip required babysitting each leg to fire the next one manually.",
    changes: [
      "Manpower reserved by an active or queued Expand now shows as already spent, and reappears if the action is cancelled before the server resolves it.",
      "The currently-executing queued action no longer shows a \"1\" badge — only actual waiting-in-line entries are numbered, starting at 1.",
      "The big \"Capturing Territory...\" overlay no longer appears for Expand — the tile-paint fill is the only feedback, matching waypoint-driven expands.",
      "Clicking a tile that's actively expanding now opens its tile detail with a Cancel expansion option, instead of only the top-level Cancel button.",
      "You can now queue multiple waypoints — clicking \"Add Waypoint\" on a new distant tile appends it instead of replacing the current one, so a multi-leg trip runs unattended leg by leg."
    ]
  },
  {
    createdAt: 1786174512000, // 2026-08-08
    introducedIn: "tech-tree-cleanup",
    title: "Fixed: several structure descriptions in the tech tree showed the wrong numbers or the wrong building",
    why: "Several structures (Assembly Works, Logistics Guild, Quartermaster's Office, Iron Levy, Population Bureau) fell through to a default and showed 'Siege Outpost' as their description. Rail Depot's description claimed it boosted the wrong building. Several structures also showed made-up upkeep costs that don't exist in the real game economy, and Aetherport's bombard and the Astral Dock's satellite launch had stale gold-cost text.",
    changes: [
      "Assembly Works, Logistics Guild, Quartermaster's Office, Iron Levy (and its part), and Population Bureau (and its part) now show their own correct description instead of Siege Outpost's.",
      "Rail Depot's description now correctly says it amplifies Logistics Guild, not Ancillary Factory.",
      "Removed fabricated upkeep costs from Aetherport, Astral Dock, Ambaric Tower, Resonance Grid, Aegis Dome, and Aegis Dome Part — none of these actually have per-minute upkeep.",
      "Aetherport's bombard ability is now free to fire (was 5,000 gold) and requires 3 CRYSTAL slots to build (was 1).",
      "The Astral Dock's satellite launch now costs 1,000 gold (was free) — text and in-game cost now match.",
      "Removed the non-functional City Overclock button — it had no effect in-game."
    ]
  },
  {
    createdAt: 1786180756479, // 2026-08-08
    introducedIn: "barley-field-overlay",
    title: "Farm tiles now render as dense golden barley fields",
    why: "Farm tiles used to read as a few neat plates of golden wheat with trees and paths, which looked sparse and farmed-out rather than like an active agricultural tile. Farms now render as a full, dense crop: a dark fertile soil bed covered in a carpet of mature golden barley with seed heads and pale awns, so a farm tile reads unmistakably as a working field.",
    changes: [
      "3D map: farm tiles now show a dense golden barley field with lean and tone variation per tile, instead of the old wheat plates and orchard trees.",
      "2D map: farm overlays were redrawn as dense barley crops with dark soil showing between clumps.",
      "Each tile's crop arrangement is deterministic, so it stays stable while panning and doesn't reshuffle on refresh."
    ]
  },
  {
    createdAt: 1786180757000, // 2026-08-08
    introducedIn: "cut-tech-bonuses-keep-muster",
    title: "Techs no longer grant passive stat bonuses — only Muster Discipline/Command's flag capacity remains",
    why: "Techs unlocking a structure or ability alongside a hidden passive stat bump (extra town gold cap, attack-vs-forts, settlement speed, outpost vision, dock gold, observatory range) made a tech's real payoff harder to read from its description. Muster Discipline and Muster Command's flag-capacity bonus is the one exception kept, by design.",
    changes: [
      "Double-Entry Ledgers, Steel Foundries, Survey Sweep, Covert Logistics, Harbor Engineering, Beacon Network, and Provincial Concessions no longer grant a passive stat bonus — each still unlocks the same structure/ability as before.",
      "Muster Discipline and Muster Command still each add +1 mustering flag capacity — unchanged."
    ]
  },
  {
    createdAt: 1786214940000, // 2026-08-08
    introducedIn: "monument-parts-population-bureau-iron-levy",
    title: "Fixed: Population Bureau and Iron Levy monument parts couldn't be built at all",
    why: "Every other monument (Imperial Exchange, Worldbreaker Cannon, Aegis Dome, Astral Dock) has a working \"build 3 parts in different Great/Monumental Cities, then place the monument for free\" flow. Population Bureau and Iron Levy's part-building buttons existed in the menu but were wired to nothing — clicking them sent no command — and the final monument itself had no build action at all, so the 3 parts you could never even place had nowhere to go.",
    changes: [
      "\"Build Population Bureau Part\" and \"Build The Iron Levy Part\" now actually build, with the same Great City/Monumental City and one-monument-part-per-city rules as the other four monuments.",
      "Added the missing \"Build Population Bureau\" and \"Build The Iron Levy\" actions — each unlocks once you own 3 of that monument's parts and have researched its tech."
    ]
  },
  {
    createdAt: 1786217054000, // 2026-08-08
    introducedIn: "consume-monument-parts-on-build",
    title: "Building a monument now consumes its 3 Parts, and the monument's own CRYSTAL cost went up to cover it",
    why: "The 3 Parts you build to unlock a monument (Imperial Exchange, Worldbreaker Cannon, Aegis Dome, Astral Dock, Population Bureau, The Iron Levy) used to just sit there forever after the monument was placed, still eating their CRYSTAL slots for nothing. Now completing the monument clears all 3 Parts automatically, and the monument's own CRYSTAL slot requirement went from 1 to 4 to absorb what they used to occupy.",
    changes: [
      "Placing any of the 6 monuments now removes all 3 of your Parts for that monument the moment it completes.",
      "Each monument's own CRYSTAL slot cost is now 4 (was 1) — no net change to your total CRYSTAL commitment once the Parts are gone."
    ]
  },
  {
    createdAt: 1786305917000, // 2026-08-09
    introducedIn: "unique-monument-components",
    title: "Each monument now has 3 uniquely-named components instead of 3 identical Parts",
    why: "Building 3 copies of one \"Part\" structure to unlock a monument read as busywork rather than assembling something. Each monument's 3 components are now distinct, individually named structures with their own art and their own build button, and the structure-info popup shows a live checklist of which ones you've completed.",
    changes: [
      "Imperial Exchange: Golden Ledger, Counting Engine, Sovereign Seal.",
      "Worldbreaker Cannon: The Long Barrel, Fracture Core, Sky-Marking Array.",
      "Aegis Dome: Shield Lattice, Ward Anchor, Aegis Crown.",
      "Astral Dock: Launch Cradle, Orbital Array, Aether Sail.",
      "Population Bureau: Census Engine, Registry Vault, Levy Charter.",
      "The Iron Levy: Muster Klaxon, Iron Standard, Levy Writ.",
      "Opening a monument's structure-info popup now shows a \"Monument Components\" checklist with a live N/3 status for each.",
      "Same rules as before: one component per Great City/Monumental City, and the monument tech gates all 3 of its own components."
    ]
  },
  {
    createdAt: 1786180758000, // 2026-08-08
    introducedIn: "expand-tile-detail-and-queue",
    title: "Frontier expansion now shows its own progress, and waypoint queues survive a refresh",
    why: "Clicking a tile to expand into it gave no feedback that anything had started, and clicking it again while it was mid-claim did nothing at all. Queuing a second (or third) waypoint also produced no visible marker on the map for it. Separately, a queued expand plan only ever lived in memory, so refreshing or reconnecting silently dropped it.",
    changes: [
      "Clicking an adjacent neutral tile to expand into it now opens its tile detail, showing claim progress with Cancel and Rush-buy buttons.",
      "Clicking a tile that's already mid-expansion reopens the same progress view instead of doing nothing.",
      "Rush-buying an in-progress frontier claim is now available, priced the same way as settlement/build rush-buys.",
      "Queued waypoints beyond the first now show their own dimmed, numbered flag on the 3D map instead of no marker at all; a waypoint's flag hides once its own tile starts actively expanding.",
      "The waypoint queue now survives a page refresh or reconnect (capped at 20 queued destinations)."
    ]
  },
  {
    createdAt: 1786399200000, // 2026-08-09
    introducedIn: "fix-dev-slot-busy-queue-sync",
    title: "Fixed a build getting rejected with \"development slots are busy\" instead of auto-queuing",
    why: "The server has only ever sent the plain message \"development slots are busy\", but the client was matching against \"all N development slots are busy\" (a format the server never sends) to learn its slot count was out of date. Since that match never fired, a stale local slot count kept letting the client try to build/expand directly instead of routing the action into the development queue, so players occasionally saw a hard rejection where the action should have queued.",
    changes: [
      "Any \"development slots are busy\" rejection now immediately marks all development slots as busy locally, so the next build/settle attempt queues instead of repeating the same failed request."
    ]
  },
  {
    createdAt: 1786267157000, // 2026-08-09
    introducedIn: "iron-titanium-deposit-overlay",
    title: "Iron tiles now show a richer metallic outcrop in 3D mode",
    why: "Iron tiles rendered as small grey ore piles, which read as minor details on the 3D map. Iron now uses the titanium-deposit outcrop mesh (bedrock lumps, bright ore chunks, tilted plates, blue-grey veins, and crystals) so mineable metal tiles are visually distinct and easier to spot.",
    changes: [
      "3D map: iron resource tiles now display a low irregular metallic outcrop with per-tile variation instead of the small ore stockpile.",
      "The visual is deterministic per tile, so it stays stable while panning and on refresh."
    ]
  },
  {
    createdAt: 1786413600000, // 2026.08.10.2
    introducedIn: "umbrite-deposit-overlay",
    title: "New Umbrite deposit overlay for the 3D map",
    why: "Umbrite is a new strategic resource planned around ancient forest deposits, and needed its own 3D tile visual so it reads distinctly from titanium, glass steel and ordinary rock when it reaches the map.",
    changes: [
      "3D map: added an Umbrite deposit overlay — an unnaturally dark near-black mineral vein breaking through an ancient forest floor, intertwined with thick fossilized roots, with subtle violet-blue sheen and sparse glowing orange fissures.",
      "The visual is deterministic per tile and ships with three layout variants, so adjacent deposits stay varied but stable while panning and on refresh."
    ]
  },
  {
    createdAt: 1786275426380, // 2026-08-09
    introducedIn: "worldbreaker-part-models",
    title: "Worldbreaker Cannon components now render as distinct 3D models",
    why: "The Worldbreaker Cannon's 3 unique components — The Long Barrel, Fracture Core, and Sky-Marking Array — previously all drew the same generic placeholder in 3D mode, so the monument-in-progress read as a row of identical boxes instead of a piece-by-piece assembly.",
    changes: [
      "3D map: each of the Worldbreaker Cannon's 3 components now renders its own dedicated model — a tapered barrel in a brass cradle, a faceted crystal core in an iron containment ring, and a tripod targeting array.",
      "All three share the monument set's flat-shaded industrial look and its dark iron, aged brass, and stone palette."
    ]
  },
  {
    createdAt: 1786224715236,
    introducedIn: "imperial-exchange-part-models",
    title: "Imperial Exchange components now render as distinct 3D models",
    why: "Imperial Exchange component tiles had no dedicated 3D model, so on the 3D map they fell back to a flat 2D overlay and read as a placeholder rather than a monument under construction. Each of the three components you build now renders its own distinct low-poly monument component.",
    changes: [
      "3D map: each of the Imperial Exchange's 3 components now renders its own dedicated model — the Golden Ledger (an upright iron ledger with brass binding and a dull-gold seal), the Counting Engine (a brass calculating drum with tally wheels and a glowing cyan ring), and the Sovereign Seal (a ceremonial iron-and-brass seal stamp with a gold crest center).",
      "The 2D fallback overlay for component tiles is no longer drawn in 3D mode, matching other structures."
    ]
  },
  {
    createdAt: 1786410000000, // 2026-08-10
    introducedIn: "aegis-dome-components",
    title: "Aegis Dome monuments now render a full defensive assembly in 3D mode",
    why: "Aegis Dome tiles drew only a bare base, core block, and translucent dome — the monument's defensive story (lattice shielding, grounding anchors, ceremonial crown) was missing from the map.",
    changes: [
      "3D map: Aegis Dome now rings its dome with three curved shield-lattice fragments (dark-iron frames, brass hex cells, one pale-cyan active cell each).",
      "Four heavy Ward Anchors (tapered iron spikes, reinforcement bands, brass cages with glowing energy orbs) pin the field at the structure's corners.",
      "A ceremonial Aegis Crown — iron base, grey ring, eight brass spikes, and a pale-cyan emissive dome cap — now crowns the apex."
    ]
  },
  {
    createdAt: 1786417200000, // 2026.08.10.4
    introducedIn: "2026.08.10.4",
    title: "New 3D Umbrite Weapons Factory",
    why: "The Umbrite Weapons Factory — a heavy military-industrial complex that forges Umbrite-tempered ordnance — now has a full 3D model, ready to be placed on the map as part of the Umbrite gameplay.",
    changes: [
      "Added a low-poly 3D Umbrite Weapons Factory: a dark-iron riveted hall with an overhanging roof and angled buttresses, twin brass-banded smokestacks, and a tall central Umbrite reactor whose ember inspection window shows the violet-black core inside.",
      "Chunky industrial pipes with coupling joints run from the reactor to a mechanical forging press and a production platform carrying standing artillery shells, plus missile-like ordnance waiting at the hall front.",
      "A brass-banded storage tank, vertical magazines and ammunition crates flank the production line, with raw Umbrite lumps and ember bits at the reactor's foot reusing the deposit palette."
    ]
  },
  {
    createdAt: 1786396516000, // 2026-08-10 — frozen from a live Date.now() call left in astral-dock-part-models
    introducedIn: "astral-dock-part-models",
    title: "Astral Dock components now render as distinct 3D models with their own map icons",
    why: "The Astral Dock's 3 unique components — the Launch Cradle, Orbital Array, and Aether Sail — previously had no dedicated art, so on the map they fell back to a generic placeholder instead of reading as a monument under construction.",
    changes: [
      "3D map: each of the Astral Dock's 3 components now renders its own dedicated model — the Launch Cradle (a curved brass rail berth with iron brackets, mechanical joints, and violet-cyan guide lights), the Orbital Array (a slim iron mast carrying an angled grey dish with brass support arms and a violet receiver lens), and the Aether Sail (a folded grey-blue sail panel on an iron mast with a brass frame, structural ribs, and violet aether markings).",
      "2D map: each component now has its own flat overlay icon matching the monument set's muted iron/brass look with restrained violet-cyan glows.",
      "The 2D fallback overlay for component tiles is no longer drawn in 3D mode, matching other structures."
    ]
  },
  {
    createdAt: 1786449600000, // 2026-08-11
    introducedIn: "next",
    title: "2D map now has SVG overlays for every structure and natural wonder that renders in 3D",
    why: "The 3D map gained several structures and all nine natural wonders that the classic 2D map couldn't draw — those tiles showed only a placeholder box, or nothing at all, so the two maps disagreed about the same world.",
    changes: [
      "New 2D SVG overlays for Seed Granary, Census Hall, Weapons Workshop, Titanium Weapons Factory, Umbrite Weapons Factory, and every World Engine and Imperial Exchange monument part.",
      "Natural wonders (Foundry Heart, Deepwater Engine, Conscription Engine, Warpress, Bastion Frame, Calculating Engine, Quickforge, Watchtower Engine, Cartographer's Lens) now render on the 2D map instead of being invisible.",
      "Each overlay matches its 3D counterpart's silhouette so the classic map and the 3D map show the same buildings."
    ]
  },
  {
    createdAt: 1786443946000,
    introducedIn: "fix/weapons-factory-build-menu-undefined",
    title: "Fixed \"undefined\" text in the Weapons Factory build menu entries",
    why: "The Titanium Weapons Factory and Umbrite Weapons Factory build options were missing their detail-text case, so the build menu literally showed the word \"undefined\" instead of a description.",
    changes: [
      "Build menu: Titanium Weapons Factory and Umbrite Weapons Factory now show a real description instead of \"undefined\"."
    ]
  },
  {
    createdAt: 1786463900000, // 2026.08.11.6 — frozen from a live Date.now() call
    introducedIn: "population-bureau-part-models",
    title: "Population Bureau components now render as distinct 3D models with their own map icons",
    why: "The Population Bureau's 3 unique components — the Census Engine, Registry Vault, and Levy Charter — previously had no dedicated art, so on the map they fell back to a generic placeholder instead of reading as a monument under construction.",
    changes: [
      "3D map: each of the Population Bureau's 3 components now renders its own dedicated model — the Census Engine (a compact horizontal brass drum in a dark iron frame with fanned parchment record cards, one separated card carrying a muted green processing glow), the Registry Vault (a squat dark-iron strongbox with reinforced brass corners, heavy hinges, a thick brass lid tilted ajar, and a restrained warm amber glow in the gap), and the Levy Charter (an upright rolled imperial decree with thick brass caps and a small unrolled section bearing a subtle gold sigil).",
      "2D map: each component now has its own flat overlay icon matching the monument set's muted iron/brass/parchment look with a single restrained emissive accent.",
      "The 2D fallback overlay for component tiles is no longer drawn in 3D mode, matching other structures."
    ]
  },
  {
    createdAt: 1786445193413, // 2026-08-11 — frozen from a live Date.now() call
    introducedIn: "revert-barley-2d-farm-overlay",
    title: "2D farm tiles show the classic wheat plates again",
    why: "The recent 2D farm overlay redraw (dense barley crops) didn't land well, so farm tiles on the 2D map are back to the previous wheat-plate look.",
    changes: [
      "2D map: farm resource tiles use the previous wheat-plate overlay style instead of the dense barley crops."
    ]
  },
  {
    createdAt: 1786453200000, // 2026-08-11
    introducedIn: "fix/dock-attack-require-foothold",
    title: "Attacking across a dock now requires capturing the dock first",
    why: "AI empires could attack land tiles merely adjacent to an enemy-linked dock without ever capturing that dock, letting them raid an island human players can only reach by first taking the dock as a foothold.",
    changes: [
      "A dock-crossing ATTACK must now land on the linked dock tile itself, for both players and AI — matching how dock-crossing EXPAND already worked.",
      "Fixes AI empires bypassing the foothold requirement that human players were always held to."
    ]
  },
  {
    createdAt: 1786454100000, // 2026-08-11
    introducedIn: "fix/dock-attack-require-foothold",
    title: "Mustering flags now fire across a linked dock",
    why: "A muster flag's auto-fire (ADVANCE mode) search only walked ordinary grid neighbors, so a flag placed on a dock could never \"see\" the enemy dock linked across the water — the flag just sat there, staged and never firing, even though a manual attack from the same tile worked fine.",
    changes: [
      "Muster flags in ADVANCE mode can now find and fire on an enemy tile across a dock link, the same way manual ATTACK commands already could."
    ]
  }
];
