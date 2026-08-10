// Changelog entry data only, split out from client-changelog.ts to keep that
// file (rendering/visibility logic) under the repo's 500-line file cap. This
// file grows by ~1 entry per user-visible change; if it approaches the cap,
// prune entries older than the 6-day window enforced by
// client-changelog.test.ts ("keeps only the latest week of changelog
// entries").
//
// Entries are unordered here — append new ones anywhere (the end is
// easiest) instead of inserting at the top. client-changelog.ts sorts by
// createdAt before rendering, so there is no shared "top of list" or
// version field for parallel branches to collide on.

export type ClientChangelogEntry = {
  createdAt: number; // Unix ms. Use Date.now() when authoring a new entry.
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};

// Add a new entry for every user-facing client release. Order doesn't
// matter; client-changelog.ts sorts by createdAt.
export const CLIENT_CHANGELOG_ENTRIES: ClientChangelogEntry[] = [
  {
    createdAt: 1786413600000, // 2026.08.10.3
    introducedIn: "2026.08.10.3",
    title: "New 3D Umbrite Extraction Rig",
    why: "The Umbrite Extraction Rig — a heavy industrial machine that drills into exposed Umbrite veins and contains their volatile stored energy — now has a full 3D model, ready to be placed on the map as part of the Umbrite gameplay.",
    changes: [
      "Added a low-poly 3D Umbrite Extraction Rig: squat iron base, reinforced drilling column with brass bands, a rotating drill descending into the ground, angled brass support struts, and anchor feet.",
      "The drill visibly penetrates an exposed violet-black Umbrite vein, with a containment collar leaking a small, restrained amount of orange containment energy.",
      "A brass-banded pressure vessel with an ember inspection window receives the extracted Umbrite through chunky industrial pipes with coupling joints and valves."
    ]
  },
  {
    createdAt: 1786410000000, // 2026.08.10.2
    introducedIn: "2026.08.10.2",
    title: "The 2D map now takes over when 3D can't run on your device",
    why: "On some phones — Safari on iPhone in particular — the 3D map could fail to start or have its graphics context taken away by the system, leaving a blank map with no explanation and no way to report what happened.",
    changes: [
      "If the 3D map can't start, or its graphics context is lost mid-session, the game now switches to the 2D map instead of showing a blank screen.",
      "A short banner explains why the 2D map is being used, with the specific reason.",
      "If loading the 3D map crashes the browser outright, the game now notices on the next visit and comes up in 2D instead of crashing again. Add ?renderer=3d to the URL to try 3D again.",
      "Downloaded diagnostics now include your device's graphics capabilities, the reason 3D was unavailable, and how far the previous 3D attempt got before the browser died — so map crashes can be diagnosed from a phone.",
      "The 3D map now sizes its memory buffers to your screen instead of always reserving for a large desktop display, which cuts its memory use substantially on phones."
    ]
  },
  {
    createdAt: 1786406400000, // 2026.08.10.1
    introducedIn: "2026.08.10.1",
    title: "Removed Bank and Exchange House; Clearing House now boosts Market",
    why: "Bank and Market did nearly the same thing, and Exchange House's bonus was never actually implemented — both were confusing dead weight in the tech tree and build menu.",
    changes: [
      "Removed the Bank and Exchange House structures.",
      "The Minting Works tech now unlocks Clearing House (instead of Bank).",
      "Clearing House now boosts Market gold production (+25%) for its town and directly connected towns, instead of boosting Bank.",
      "Removed the Provincial Concessions tech; Grand Bazaars now requires Minting Works directly.",
      "Fixed the tech tree structure card showing two separate 'Upkeep' boxes for structures with more than one resource-slot requirement (Bank, Foundry, Rail Depot, Radar System, Exchange House, Ambaric Tower, Weapons Workshop, Assembly Works, Siege Tower, Dread Tower) — now shown as one combined box.",
      "Moved Terrain Shaping into the Aether tech branch (was miscategorized under Economy); it now requires Covert Logistics and unlocks Sky Vessel Engineering alongside its other prerequisites."
    ]
  },
  {
    createdAt: 1786320000000, // 2026.08.09.2
    introducedIn: "2026.08.09.2",
    title: "Smaller soil mound on grain tiles",
    why: "The dirt bed under the barley crop was large enough to cover most of the tile, hiding the grain it was supposed to sit beneath.",
    changes: [
      "Shrunk the grain tile's soil mound and widened the crop patch so the golden barley fills the tile, with the dirt only showing as a thin rim.",
      "Increased stalk and seed-head density for a fuller-looking crop."
    ]
  },
  {
    createdAt: 1786306202000, // 2026.08.09.1
    introducedIn: "2026.08.09.1",
    title: "Muster tile cap tag on Muster Discipline/Command",
    why: "Muster Discipline, Muster Command, and War Foundries each grant +1 muster flag capacity, but the tech tree card never showed a highlight chip for it — every other tech payoff (unlocks, reveals) got a tag except this one.",
    changes: [
      "Muster Discipline, Muster Command, and War Foundries now show a \"Muster Flag +1\" chip on their tech-tree card and detail view."
    ]
  },
  {
    createdAt: 1786165552001, // 2026.08.08.2
    introducedIn: "2026.08.08.2",
    title: "Clearer Discovery tips",
    why: "The first-seen tooltips for towns, docks, barbarians, and strategic resources were vague about what each tile actually does or how to use it.",
    changes: [
      "Reworded the Town, Dock, Barbarian, Food, Iron, Crystal, and Supply discovery tips to explain what the tile produces and why capturing/settling it matters."
    ]
  },
  {
    createdAt: 1786165552000, // 2026.08.08.1
    introducedIn: "2026.08.08.1",
    title: "Wooden Fort renamed to Palisade",
    why: "\"Wooden Fort\" was a mouthful next to the ladder's other short names (Fort, Titanium Bastion, Thunder Bastion); Palisade is shorter and reads as the entry-tier defensive structure it is.",
    changes: [
      "The lightweight border/dock fortification is now called \"Palisade\" everywhere in the UI — tile menu, economy panel, and build actions. No change to its cost, defense bonus, or build time."
    ]
  },
  // 2026.07.26.1 ("Expand and Settle now cost manpower"), 2026.07.27.1
  // ("Manpower now gates every structure build"), 2026.07.27.2 ("Structures
  // no longer cost gold to build"), 2026.07.27.3 ("Garrison Hall and
  // Rail Depot now grant real manpower bonuses"), 2026.07.28.1 ("Rush-buy:
  // finish an in-progress settle or build for gold"), 2026.07.28.2 ("Economy
  // panel: Food/Iron/Crystal/Supply now show slot capacity, not stale stock
  // numbers"), 2026.07.28.3 ("Food is now purely a slot resource; town
  // growth costs gold + a Food slot"), 2026.07.28.2 ("Fixed: Empire
  // Integrity warning nagged you on every login; added discovery tips"), and
  // 2026.07.28.3 ("Fixed: farms, towns, and other overlays floated above
  // hills in 3D mode") pruned: aged out of the 6-day window during this
  // merge.
  // 2026.07.27.1 ("Fixed: large-empire logins could still stall for 15+
  // seconds"), 2026.07.27.2 ("Fixed: ownership overlay and buildings
  // invisible on hills in 3D mode"), 2026.07.27.3 ("Fixed: login stalls on
  // mobile reduced by ~50%"), 2026.07.27.4 ("Fixed: territory ownership
  // overlay didn't follow the hill's shape"), 2026.07.28.1 ("Fixed: hill
  // tiles had no grid square around them in 3D mode"), 2026.07.28.3
  // ("Discovery tips for docks and barbarians..."), 2026.07.28.4 ("New
  // season now requires 5 players to vote"), and 2026.07.28.5 ("Season-end
  // Misc tab with deadliest tile and longest road") pruned: aged out of the
  // 6-day window during this merge. "Victory countdown now shows immediately
  // when a threshold is met" (2026-07-28) also pruned: it was previously
  // authored with a live Date.now() call instead of a frozen timestamp,
  // which silently kept it looking brand-new; corrected to its real
  // authored time, it's outside the 6-day window like the others above.
  // Natural Wonders, fort/outpost upkeep rebalance, town food-slot demand,
  // and town vision-bonus entries pruned: aged out of the 6-day window.
  // 2026.08.01.1 ("Rail Depot's Garrison Hall bonus quadrupled..."),
  // 2026.08.02.1 ("First 5 Light Outposts no longer cost a FOOD slot"),
  // 2026.08.02.2 ("Build Light Outpost menu no longer shows a FOOD slot
  // cost..."), and 2026.08.03.1 ("Fixed: removing a structure crashed the
  // game") pruned: aged out of the 6-day window.
  // buildings-tab-always-show, 2026.08.03.2, wooden-fort-no-iron-build,
  // event-log-explicit-sort, economy-slot-upkeep-no-daily-flow, and
  // 2026.08.03.3 pruned: aged out of the 6-day window.
  // badge-render-order-above-roads and 2026.08.03.4 ("Natural wonder tiles
  // now show what they do...") pruned: aged out of the 6-day window.
  // town-upgrade-ready-badge, 2026.08.03.6, 2026.08.03.5, the three
  // natural-wonder-3d-fidelity entries, and the dirt-road entry pruned:
  // aged out of the 6-day window (the fix-dev-slot-busy-queue-sync entry
  // moved the window anchor forward during this merge).
  {
    createdAt: 1785910000000, // manpower overlays
    introducedIn: "next",
    title: "Manpower-branch buildings render on the map",
    why: "The steampunk Manpower economy branch (quartermaster supply, logistics guilds, conscription, and the workforce-producing Ancillary Factory, Incubation Engine, and Ambaric Tower) had no map art yet. Each building now renders as a distinct 3D model in 3D mode and as a hand-drawn 2D sprite on the classic map.",
    changes: [
      "8 new manpower buildings render on the map: Quartermaster's Office, Logistics Guild, Assembly Works, Population Bureau, The Iron Levy, Ancillary Factory, Incubation Engine, and Ambaric Tower.",
      "3D mode: each building has its own silhouette in a shared bronze/gunmetal/amber steampunk palette - brass supply counters, schedule-tower dials, drive-shaft gears, census columns, an orders-horn ember, boiler ward ports, and spiral ambaric coils.",
      "2D mode: new map sprites for all 8 buildings."
    ]
  },
  {
    createdAt: 1786003565156, // 2026-08-06
    introducedIn: "next",
    title: "Fixed: changes made to the world while you were offline could stay missing after you logged back in",
    why: "The server keeps a cached copy of each player's world snapshot to make logging back in fast, but it only kept that copy up to date while you were connected. Anything that changed while you were offline never reached it, and logging in served the cached copy as-is with no catch-up — so those tiles stayed wrong on your map indefinitely, because nothing later would necessarily touch them again. The most visible case was an outpost built while you were disconnected: the tiles its vision should have revealed stayed dark forever.",
    changes: [
      "Logging in now rebuilds your world snapshot whenever the world changed while you were away, instead of serving a stale cached copy.",
      "Fixes outpost vision discs that never revealed their tiles after a reconnect, and the same staleness for territory ownership, towns and structures that changed while you were offline.",
      "Fast reconnects where nothing has changed still use the cached snapshot, so logging back in is no slower than before."
    ]
  },
  {
    createdAt: 1786035996000, // 2026-08-06
    introducedIn: "next",
    title: "Fixed leftover bugs from the tech-tree redesign: stale bonus text, wrong gold pricing, missing branch tags",
    why: "The tech-tree redesign (branch structure, no-flat-bonus techs, steampunk renaming) shipped with three regressions: some tech cards still printed old attack/defense/vision bonus text even though the redesign removed all flat-bonus techs, every tech's gold cost was a different leftover per-tier price instead of the intended flat +50-per-researched-tech curve, and the tree UI had no visible tag showing which of the four branches (War/Economy/Manpower/Aether) a tech belonged to.",
    changes: [
      "Tech cards and detail views no longer print stale attack/defense/vision multiplier text — only real building/ability unlocks are shown.",
      "Every tech now costs 10 gold plus 50 gold per tech you've already researched, applied uniformly instead of the old scattered per-tier prices.",
      "Tech cards now show a colored branch tag (War/Economy/Manpower/Aether) so it's clear which branch a tech belongs to.",
      "The Iron Levy monument's ability can now actually be triggered — it was fully implemented on the server but was never wired into the game's network layer.",
      "Caravanary now enables the connected-town road network itself (towns need at least one built to share the gold bonus) instead of just adding +25% on top of an already-existing bonus."
    ]
  },
  {
    createdAt: 1786036800000, // 2026-08-06
    introducedIn: "next",
    title: "Fixed a build-menu crash and several dead/mismatched tech gates left over from the tech-tree redesign",
    why: "The Manpower branch's 4 newest buildings (Assembly Works, Logistics Guild, Population Bureau part, Iron Levy part) were added to one type definition but never to the lookup table behind it, crashing the tile menu on click. Separately, several buildings (Observatory, Aether Purge, Clearing House) were still gated on tech ids that no longer exist after the redesign's renaming pass, permanently blocking them in the UI even though the server never required them, or in Clearing House's case required no tech at all.",
    changes: [
      "Fixed a crash opening the tile menu for towns with an Assembly Works, Logistics Guild, or an in-progress Population Bureau/Iron Levy part.",
      "Observatory and Aether Purge now correctly require Aetheric Resonance (they previously required two retired tech ids and could never be built or used).",
      "Clearing House no longer requires a nonexistent tech — it now matches the server's real requirement (none, just a free resource slot).",
      "Ancillary Factory's 2D and 3D map art now actually renders its own dedicated model instead of the old Garrison Hall art (it was built but never wired up).",
      "Incubation Engine and Ambaric Tower's dedicated 3D models are now wired up the same way.",
      "Fixed a pile of build-menu labels and requirement text still showing old pre-redesign tech names (e.g. \"Requires Organized Supply\", \"Requires Banking\", \"Requires Cartography\")."
    ]
  },
  {
    createdAt: 1786037400000, // 2026-08-06
    introducedIn: "next",
    title: "Tech unlock chips now have visible spacing and icons showing structure vs ability vs upgrade",
    why: "A tech that unlocks more than one thing (e.g. Tanner's Craft unlocking both Camp and Siege Outpost) rendered its chips with zero styling or spacing, so multiple unlock names ran together into one unreadable string like \"CampSiege Outpost.\" There was also no visual way to tell whether a chip was a new building, a new ability, or an upgrade to something you already have.",
    changes: [
      "Unlock chips are now spaced out and each gets its own background/border pill instead of running together as one string.",
      "Chips now carry an icon by category: a building glyph for structures, a lightning bolt for abilities, and an up arrow for upgrades.",
      "Added the 5 missing Manpower-branch unlock chip labels (Quartermaster's Office, Logistics Guild, Assembly Works, Population Bureau, The Iron Levy) that previously rendered blank."
    ]
  },
  {
    createdAt: 1786038000000, // 2026-08-06
    introducedIn: "next",
    title: "Fixed Ancillary Factory's fabricated defense bonus and wrong-anywhere placement",
    why: "Ancillary Factory (formerly Garrison Hall, before the Manpower-branch redesign) still had two leftover behaviors from its old identity as a defensive structure: its tooltip claimed a +20% settled-tile defense bonus that no combat code anywhere actually applies, and its placement rules let it be built on almost any tile instead of the town-support tile every other Manpower building requires. Quartermaster's Office had the same wrong-anywhere placement bug. Also fixed a stale, exactly-288x-off gold/day figure on Customs House and Bank/Clearing House tooltips left over from an old economy rescope, and Governor's Office's tooltip, which still described a \"settled-tile upkeep\" reduction that doesn't exist in the game (upkeep and FOOD slot demand are different things).",
    changes: [
      "Ancillary Factory's tooltip no longer claims a settled-tile defense bonus it never actually applies — it only ever affected manpower cap.",
      "Ancillary Factory and Quartermaster's Office must now be built on a town support tile, matching every other Manpower building, instead of almost anywhere.",
      "Customs House now correctly shows +5 gold/day per connected dock instead of +1440 (a leftover pre-rescope number, off by 288x).",
      "Bank and Clearing House tooltips now show the correct +5 / +7.5 gold/day flat income instead of the same stale +1440/+720 figures.",
      "Governor's Office's tooltip now accurately describes its real effect (reduces a nearby town's FOOD slot demand) instead of a settled-tile upkeep reduction that was never implemented."
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
      "Market and Ancillary Factory also lost their one-per-town limit, so towns can specialize with multiples of either."
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
  // Older entries (2026.07.22.1 and earlier) trimmed: the release-day
  // window test only keeps entries within the latest 6 days of the newest
  // entry's createdAt -- see git history for the full changelog.
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
  }
];
