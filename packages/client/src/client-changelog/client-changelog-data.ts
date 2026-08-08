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
    createdAt: 1786165552000, // 2026.08.08.1
    introducedIn: "2026.08.08.1",
    title: "Wooden Fort renamed to Palisade",
    why: "\"Wooden Fort\" was a mouthful next to the ladder's other short names (Fort, Iron Bastion, Thunder Bastion); Palisade is shorter and reads as the entry-tier defensive structure it is.",
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
  // 2026.08.02.1 ("First 5 Light Outposts no longer cost a FOOD slot"), and
  // 2026.08.02.2 ("Build Light Outpost menu no longer shows a FOOD slot
  // cost...") pruned: aged out of the 6-day window.
  {
    createdAt: 1785697200000, // 2026.08.03.1
    introducedIn: "2026.08.03.1",
    title: "Fixed: removing a structure crashed the game",
    why: "The client's build pipeline already routed structure removals through the development queue and the server fully supported REMOVE_STRUCTURE, but the removal's optimistic preview was never handed to the action flow during client bootstrap — so clicking Remove on a Fort, Observatory, Siege Outpost, or economic structure threw a crash instead of starting the removal.",
    changes: [
      "Clicking Remove on a structure you own now starts the removal instead of crashing the client.",
      "Queued removals dispatch through the same development queue as builds and show the same removing countdown."
    ]
  },
  {
    createdAt: 1785735055000, // 2026-08-03
    introducedIn: "buildings-tab-always-show",
    title: "Buildings tab now shows on any tile you own, and building an unsettled tile settles it first automatically",
    why: "The Buildings tab only appeared after you had already settled a tile, so building anything on a freshly claimed tile meant a two-step detour: open the Actions tab, hit Settle Land, wait for it to finish, then reopen the tile and finally press the actual build button. Clicking Build now handles the settle step for you, so a claimed-but-unsettled tile behaves like any other owned tile.",
    changes: [
      "The Buildings tab now appears on every tile you own — whether it's still a frontier claim or already settled — so all eligible buildings are visible the moment you take the tile.",
      "Clicking \"Build X\" on a tile you own but haven't settled automatically settles the tile first, then builds the structure the moment settlement completes (the old settle-then-build flow that only existed for Light Outposts now applies to every building type).",
      "While a build is settling-then-building on a tile, a second \"Build Y\" click on that same tile is blocked with a warning instead of silently replacing the first build.",
      "On an unsettled owned tile, each building's cost/time preview now shows the combined settle + build totals (e.g. \"350 gold, 100 m.p. • settle + build • 4m total\") and its description notes that it settles the tile first.",
      "Build Foundry and Build Waterworks still let you pick the exact placement tile, including when the settle happens automatically first."
    ]
  },
  {
    createdAt: 1785739605000, // 2026.08.03.2
    introducedIn: "2026.08.03.2",
    title: "Fixed: Build Light Outpost button disappeared when out of FOOD slots",
    why: "The Actions tab hid itself entirely whenever every action on it was disabled, so a player with 5+ Light Outposts and no free FOOD slot lost the button instead of seeing why it was unavailable.",
    changes: [
      "Disabled actions are now always shown with their blocker message instead of hiding the whole Actions tab, matching how the Buildings tab already behaves."
    ]
  },
  {
    createdAt: 1785738838000, // 2026-08-03
    introducedIn: "wooden-fort-no-iron-build",
    title: "Wooden Fort no longer charges a lump-sum iron cost to build",
    why: "Building a Wooden Fort showed a 15-iron requirement left over from before the manpower-economy rewrite moved resource costs onto permanent slot occupation — the same stale-cost class the prior update cleaned off the crystal structures. A Wooden Fort's real cost is manpower plus its permanent IRON slot, so the iron line is gone.",
    changes: [
      "Building or upgrading to a Wooden Fort no longer deducts 15 iron up front — its cost is manpower plus the 1 IRON slot it permanently occupies."
    ]
  },
  {
    createdAt: 1785758343576, // event-log-explicit-sort
    introducedIn: "event-log-explicit-sort",
    title: "Recent Events feed now sorts explicitly instead of assuming server order",
    why: "The Recent Events panel built its most-recent-first display by reversing the server's array, which only works if the server always appends oldest-last. That ordering held today, but nothing enforced it, so a future change to how entries are appended or merged could have silently flipped the whole feed to oldest-first with no error.",
    changes: [
      "The Recent Events panel now sorts entries by their timestamp (newest first) instead of blindly reversing the incoming array, so display order stays correct regardless of the order entries arrive in."
    ]
  },
  {
    createdAt: 1785738839000, // 2026-08-03
    introducedIn: "economy-slot-upkeep-no-daily-flow",
    title: "Economy panel no longer shows slot upkeep as a negative daily flow",
    why: "Since Food/Iron/Crystal/Supply became slots, a structure's upkeep is the slot it permanently occupies — but the detail cards were still also showing those structures as a per-day flow cost (a 4-outpost empire read \"Light Outpost · 4  -576.0/day\" right below the same 4 slots listed under \"Occupied by\"). That was the same cost counted twice, and it read like the game was draining a food stockpile that no longer exists.",
    changes: [
      "The Food/Iron/Crystal/Supply cards no longer have a separate Upkeep column — slot upkeep for these resources is fully represented by the slot count already shown in \"Occupied by\". Cross-resource flow costs (e.g. a synthesizer's gold upkeep) still appear, but only once, on the GOLD card.",
      "The \"Empire upkeep:\" summary line at the top now shows only gold upkeep — the one resource that still works as a daily flow — instead of also quoting per-day food/iron/supply/crystal figures."
    ]
  },
  {
    createdAt: 1785758070000, // 2026.08.03.3
    introducedIn: "2026.08.03.3",
    title: "Fixed: buildings tab showed nothing on an unsettled tile with no resource, town, or dock",
    why: "The always-show-Buildings-tab update relaxed every building's settled requirement in the menu logic, but the shared placement-surface check it also runs through still only counted a tile as \"settled\" when it was actually SETTLED. Any building without a resource/town/dock alternative surface (Fort, Observatory, Airport, Aether Tower, Radar System, the four monuments, Governor's Office, Garrison Hall) still had nowhere to attach, so a bare claimed tile showed \"No buildings available on this tile right now\" instead of the settle-then-build list.",
    changes: [
      "An owned frontier tile now also counts as the \"settled\" placement surface for menu purposes, so every building type appears and queues its settle-then-build chain the same way resource/town/dock-gated buildings already did."
    ]
  },
  {
    createdAt: 1785776329000, // 2026-08-03
    introducedIn: "badge-render-order-above-roads",
    title: "Fixed: food/resource-shortage badges could render behind roads",
    why: "The floating badge shown over a dormant/unfed structure (and the observatory cooldown badge) drew earlier than the road overlay even though both are transparent, so wherever a road ran under one of these badges, the road painted over it and hid it — despite the badge floating well above the road visually.",
    changes: [
      "The dormant-structure/unfed-town badge and the observatory cooldown badge now always render above roads, so they stay visible on tiles a road passes through.",
      "This applies to every structure type that can go dormant from a resource-slot shortfall (Light Outpost included), not just towns."
    ]
  },
  {
    createdAt: 1785788216000, // 2026-08-03
    introducedIn: "town-upgrade-ready-badge",
    title: "Towns that can upgrade to their next tier now show a floating badge",
    why: "A town that has grown enough population to reach its next tier (Town→City→Great City→Metropolis) had no at-a-glance signal on the map — you only found out by clicking the town and reading its \"Next size\" line or the upgrade action in the tile-menu. The map already floats a badge over towns missing food, so the same style of badge now flags towns with an upgrade waiting.",
    changes: [
      "An owned, settled town whose population has hit its next-tier threshold now shows a small green up-arrow badge floating above it in 3D mode, mirroring the unfed-town badge.",
      "The badge only appears for your own settled towns that are actually ready to upgrade (neutral, foreign, unsettled, SETTLEMENT, and already-max-tier towns stay unmarked), matching what the tile-menu upgrade action offers."
    ]
  },
  {
    createdAt: 1785786820000, // 2026.08.03.4
    introducedIn: "2026.08.03.4",
    title: "Natural wonder tiles now show what they do in the tile detail panel",
    why: "Worldgen has placed natural wonders (Deepwater Engine, Foundry Heart, Bastion Frame, etc.) on the map for a while, but the tile detail Overview tab never mentioned them at all — a wonder tile you'd claimed just looked like an ordinary frontier or settled tile, with no way to tell it was special or what claiming/settling it would grant.",
    changes: [
      "The Overview tab now shows a natural wonder's name and boon on any tile that has one, and notes whether the boon is already active (settled and owned by you), still needs the tile settled first (owned but frontier), or is just informational (not yours yet)."
    ]
  },
  {
    createdAt: 1785790524109, // 2026.08.03.6
    introducedIn: "2026.08.03.6",
    title: "Removed Fort/Siege/Light Outpost's per-minute FOOD/IRON/SUPPLY drain, a stray attack-range overlay, and an Economy tab overcount",
    why: "Forts, Siege Outposts, and Light Outposts each drained a separate per-minute FOOD/IRON/SUPPLY cost from your stockpile on top of already occupying a resource slot for the same structure — the tile detail panel showed a Light Outpost costing '144.0/day' food in addition to its 1 FOOD slot, meaning a single outpost billed you twice for the same resource. Separately, selecting an outpost drew a red attack-range ring left over from a shelved mechanic, and the Economy tab's 'Occupied by' breakdown ignored the waiver that makes a player's first 5 Light Outposts free, so a 4-outpost empire was shown as using 4 FOOD slots instead of 0.",
    changes: [
      "Fort, Iron Bastion, Thunder Bastion, Wooden Fort, Siege Outpost, Siege Tower, Dread Tower, and Light Outpost no longer drain FOOD/IRON/SUPPLY per minute — their only ongoing cost is the resource slot they occupy.",
      "The tile detail Upkeep section now shows the resource-slot cost (e.g. 'Fort: 1 IRON slot') for any active fort/siege/economic structure instead of the removed per-day drain.",
      "Disabled the red attack-sweep-range overlay that appeared when selecting a Light Outpost or Siege Outpost — it wasn't tied to any real attack mechanic.",
      "The Economy tab's FOOD slot breakdown now correctly applies the free-slot waiver, so Light Outposts under the waiver count no longer inflate the 'Occupied by' total."
    ]
  },
  {
    createdAt: 1785790524108, // 2026.08.03.5
    introducedIn: "2026.08.03.5",
    title: "Fixed: the off-screen alert arrows (unfed town / active muster) were the biggest source of frame lag",
    why: "The pulsing arrow that points toward an off-screen unfed town or active muster flag re-scanned every tile you had ever discovered this session, every single frame, to find its target — on a long-lived session with a lot of explored map, that scan alone was averaging ~5.8ms/frame and spiking past 20ms, chewing through most of the mobile frame budget.",
    changes: [
      "That scan now only re-runs a few times a second instead of every frame; the arrow itself still redraws and tracks the camera every frame, so it stays smooth with no flicker, it just detects new/cleared alerts within about a fifth of a second instead of instantly."
    ]
  },
  {
    createdAt: 1785828860656, // 2026-08-04
    introducedIn: "natural-wonder-3d-fidelity",
    title: "Natural wonders now look like their concept art in 3D mode",
    why: "Every natural wonder's Storybook reference (packages/storybook/src/wonders/*) was built as a detailed model with custom shaders, particle effects, and multiple structural pieces, but the in-game 3D overlay for each one shipped as a rough placeholder — a couple of plain colored shapes with none of the pipes, gears, ground glow, or particles the design called for. A claimed Deepwater Engine, for example, rendered as a single dark cylinder with one teal ring instead of the gear-driven pump facility with copper piping and rising bubbles it's supposed to be.",
    changes: [
      "All 9 natural wonders (Deepwater Engine, Foundry Heart, Conscription Engine, Warpress, Bastion Frame, Calculating Engine, Quickforge, Watchtower Engine, Cartographer's Lens) now render in 3D mode with the full geometry, shader materials, ground-glow effects, and particle systems from their Storybook reference instead of a simplified placeholder."
    ]
  },
  {
    createdAt: 1785832166768, // 2026-08-04
    introducedIn: "natural-wonder-3d-fidelity",
    title: "Fixed: natural wonder ground glow drifted as you panned the map",
    why: "The new natural-wonder ground-glow shaders (fissures, scorched earth, water ripples, etc.) computed their radial pattern from each vertex's raw world position. That's centered on the wonder in Storybook, where the model always sits at the scene origin, but the live map recenters the whole 3D scene around the camera every frame, so a wonder's mesh is actually translated to a camera-relative offset that shifts as you pan. The glow pattern followed that drift instead of staying anchored to the wonder, visibly sliding out from under the model as the camera moved.",
    changes: [
      "Natural wonder ground-glow, water, and metal-rim shaders now compute their pattern from the vertex's position relative to the wonder's own mesh (rotation/scale only, no translation) instead of raw world position, so the effect stays locked to the wonder regardless of camera pan."
    ]
  },
  {
    createdAt: 1785836373986, // 2026-08-04
    introducedIn: "natural-wonder-3d-fidelity",
    title: "Fixed: natural wonder ground glow got cut off near coastlines and hills",
    why: "The natural wonder ground-glow effect (fissures, scorched earth, water ripples) spans a wonder's own tile plus its 8 neighbors, but it was rendered as one flat plane at the wonder's own tile height. Real terrain elevation varies a lot across that span (grass, sand, coastal sea, deep sea, and hills are all different heights), so on any wonder near a coastline or a hill, the flat effect either floated above/sank under the real terrain, got hidden behind the actual water surface, or was clipped by rising land poking through it.",
    changes: [
      "The ground-glow effect now follows the real terrain's contour across its full 3x3 span, sampling the same corner heights the terrain mesh itself renders from (matching the technique the territory-ownership tint already uses to drape over hills) — it clips correctly against hills and anything built on a neighboring tile, and now renders visibly above the water surface on any neighboring sea tile instead of being hidden underneath it."
    ]
  },
  {
    createdAt: 1785875930619, // dirt road
    introducedIn: "next",
    title: "Roads are now worn dirt paths instead of cobblestone",
    why: "3D roads switch from hard cobblestone to packed dirt, matching how a low-tech empire actually travels while reading cleanly on any terrain.",
    changes: [
      "Roads are now dirt paths: packed brown earth with mottled soil tones, two subtle wheel ruts, and a faint worn center.",
      "Small pebbles are scattered sparsely along the surface, each with soft directional shading so they read as stones set in the dirt.",
      "Road edges wear down to a ragged, slightly darker rim with no grass or green tint, so roads sit naturally on any terrain - including deserts and sand.",
      "The same gentle lift over hills and junction hubs are unchanged."
    ]
  },
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
    createdAt: Date.now(),
    introducedIn: "resource-reveal-settle-and-ribbon",
    title: "Fixed: settling near a hidden resource revealed it early, and the toolbar showed hidden resource types",
    why: "Iron, Supply, and Crystal are supposed to stay hidden until you've researched the tech that reveals them. That masking was already fixed for the streaming map view and for what you see on login, but settling next to a hidden resource (or capturing territory near one) still exposed it instantly through a separate reveal path. The toolbar's resource ribbon also always showed all four resource pills regardless of tech.",
    changes: [
      "Settling, expanding, or capturing near an unrevealed Iron/Supply/Crystal tile no longer exposes its resource type early.",
      "The toolbar's resource ribbon now hides the Iron/Crystal/Supply pill entirely until you've researched the tech that reveals it."
    ]
  },
  {
    createdAt: Date.now() + 1,
    introducedIn: "resource-reveal-economy-panel",
    title: "Fixed: the detailed economy screen still listed hidden resources",
    why: "The ribbon fix hid Iron/Crystal/Supply from the toolbar, but the detailed economy screen (opened by tapping a resource, or from the panel nav) still showed a card for each one with a \"No access to this resource yet\" label — still revealing that the category exists before you've earned it.",
    changes: [
      "The economy screen's summary cards and detail breakdowns now hide Iron/Crystal/Supply entirely until revealed, instead of showing an empty placeholder card."
    ]
  },
  {
    createdAt: Date.now() + 2,
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
    createdAt: Date.now() + 3,
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
    createdAt: Date.now() + 3,
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
    createdAt: Date.now() + 4,
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
  }
];
