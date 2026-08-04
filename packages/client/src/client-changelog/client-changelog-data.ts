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
  // "Roads follow hills, look more realistic" (road-hill-wrap, 2026-07-29)
  // pruned: aged out of the 6-day window during this merge.
  {
    createdAt: 1785575868160, // next
    introducedIn: "next",
    title: "Natural Wonders dot the landscape",
    why: "9 ancient wonders are now scattered across the world. Claim them to gain permanent bonuses — more manpower, stronger forts, faster mustering, and more.",
    changes: [
      "Foundry Heart: +1 slot for FOOD/IRON/CRYSTAL/SUPPLY",
      "Deepwater Engine: dock gold income doubled, dock attacks +15% ATK",
      "Conscription Engine: +2000 manpower cap, instant +2000 on first claim",
      "Warpress: 2× muster rate, +1 extra flag (max 6)",
      "Bastion Frame: fort defense multipliers +0.5×",
      "Calculating Engine: tech gold costs -10%",
      "Quickforge: once per day, rush-buy costs 0 gold",
      "Watchtower Engine: acts as a free Observatory, no CRYSTAL upkeep",
      "Cartographer's Lens: +1 vision range on all owned tiles",
      "Each wonder renders as a unique, animated 3D landmark on the map — pulsing crystal, spinning gears, a striking forge hammer, and more.",
      "Claiming a wonder adds a Recent Events entry with its flavor text and the exact boon it grants."
    ]
  },
  {
    createdAt: 1785443475000, // 2026-07-30
    introducedIn: "next",
    title: "Economy: per-day rates, 1000 gold/day victory threshold, 24h gold cap",
    why: "Gold display as per-minute (/m) was hard to relate to actual gameplay pacing — a town earning 0.01 gold/min reads as \"nothing\" when it's actually 14.4 gold/day. Per-day rates make income, upkeep, and victory thresholds immediately meaningful without mental math.",
    changes: [
      "All gold (and most resource) rates now display as /day instead of /m — the HUD gold chip, economy panel, tile production/upkeep, build menu entries, empire intel, side panel, and season-end overlay all use per-day formatting.",
      "Economic victory now requires 1000 gold/day (up from the old ~0.4/min / ~576/day effective threshold), with all labels and tooltips updated.",
      "Gold storage cap now holds 24 hours of production (up from 12h), with a floor of 10 gold instead of 500.",
      "Build menu upkeep strings corrected: non-synthesizer structures no longer show stale per-minute gold/food values (their slot occupation is their upkeep), and synthesizers now show correct per-day gold costs (30/45/40/60 gold/day)."
    ]
  },
  {
    createdAt: 1785399415000, // 2026-07-30
    introducedIn: "light-outpost-exploration",
    title: "Light Outposts reveal 5×5 area",
    why: "Light Outposts previously had no exploration use — building them at the edge of known territory revealed nothing beyond.",
    changes: [
      "Light Outposts now grant +5 vision, revealing a 5-tile radius (13×13 area) around them when built.",
      "A \"Build Light Outpost\" action appears on owned tiles adjacent to unexplored terrain, making them the default exploration tool.",
      "The action includes cost, build time, attack multiplier, and vision bonus in a single button."
    ]
  },
  {
    createdAt: 1785444298000, // 2026-07-30
    introducedIn: "light-outpost-distant-expansion",
    title: "Build Light Outpost on distant unexplored-adjacent tiles",
    why: "Light Outpost was locked to tiles adjacent to your territory, but true frontier exploration means expanding into the unknown without claiming every tile in between. Distant unowned tiles adjacent to unexplored terrain are now a valid target for expansion.",
    changes: [
      "Light Outpost can now be built on any unowned tile adjacent to unexplored terrain, even if it's not adjacent to your current territory — the action handles frontier expansion end-to-end without intermediate claims.",
      "\"Build Light Outpost\" now appears in the main actions tab (not buildings) so it's discoverable as a frontier-exploration tool, not a structure you place on your own land.",
      "The action's cost, build time, attack bonus, and vision grants remain the same — only the placement rules expanded to make distant exploration viable."
    ]
  },
  {
    createdAt: 1785564673000, // 2026-08-01
    introducedIn: "structure-upkeep-rebalance",
    title: "Fort and outpost upkeep now runs on food plus their resource",
    why: "Military structures were free to keep after building (their slot occupation was the only upkeep), so there was no ongoing pressure to hold the farms, iron, and supply that an empire's defenses depend on. Giving each defensive tier a steady drain makes maintaining your military a real land-use decision.",
    changes: [
      "Light Outpost and Wooden Fort now cost only 1 FOOD upkeep (no gold).",
      "Fort and its tiers (Fort, Iron Bastion, Thunder Bastion) cost 1 FOOD plus increasing IRON upkeep per tier.",
      "Siege Outpost and its tiers (Siege Outpost, Siege Tower, Dread Tower) cost 1 FOOD plus increasing SUPPLY upkeep per tier.",
      "These show up in each structure's tile-detail upkeep listing."
    ]
  },
  {
    createdAt: 1785564621000, // 2026-08-01
    introducedIn: "town-food-slot-demand",
    title: "Towns now draw 4 food slots each",
    why: "Towns were only drawing 2 food slots while they scaled gold/income with tier, so growth never stressed your farming network the way it should. Raising base town demand to 4 makes feeding a growing empire an ongoing land-use decision rather than a one-time setup.",
    changes: [
      "Each TOWN now consumes 4 FOOD resource slots (up from 2) to stay fed, so a growing empire needs proportionally more farms and fishing.",
      "SETTLEMENTs still draw 0 food slots; CITY, GREAT_CITY, and METROPOLIS each add +1 on top of the town base, matching how their income scales."
    ]
  },
  {
    createdAt: 1785564622000, // 2026-08-01
    introducedIn: "town-vision-bonus",
    title: "Towns reveal one extra tile of vision",
    why: "Towns are the most valuable, permanent things you build, but they revealed no more of the map than an ordinary claimed tile — so defending your core gave you no strategic awareness around it. Letting each settled town's own reveal reach one tile further rewards building up your home territory.",
    changes: [
      "Every SETTLED town tile — including a freshly-founded SETTLEMENT — now reveals its surroundings one tile further than a plain owned tile; its own reveal is radius+1.",
      "Applies consistently to the map you see on login, the tile updates streamed as you play, and barbarian visibility."
    ]
  },
  {
    createdAt: 1785649123000, // 2026.08.02.1
    introducedIn: "2026.08.02.1",
    title: "First 5 Light Outposts no longer cost a FOOD slot",
    why: "A FOOD slot requirement made early exploration compete with a player's actual economy for the same scarce resource, discouraging the frontier-pushing Light Outposts already exist to encourage.",
    changes: [
      "Your first 5 Light Outposts (earliest-built first) now cost 0 FOOD slots; only the 6th onward draws from your FOOD slot pool like other structures.",
      "Both \"Build Light Outpost\" buttons — the direct build and the frontier expand+settle+build action — now correctly show and enforce this, disabling with \"Need a free FOOD slot\" only once it actually applies."
    ]
  },
  {
    createdAt: 1785618075910, // 2026.08.01.1
    introducedIn: "2026.08.01.1",
    title: "Rail Depot's Garrison Hall bonus quadrupled; stale crystal costs removed",
    why: "Rail Depot's per-Garrison-Hall cap amplifier was only +75, a small fraction of a single Metropolis's 2,400 cap, undercutting the network investment it was meant to reward. Separately, several structures (Garrison Hall included) still displayed a CRYSTAL build cost left over from before the manpower-economy rewrite moved resource costs onto permanent slot occupation — that CRYSTAL amount was never actually charged, just confusing, stale copy.",
    changes: [
      "Rail Depot's network amplifier now grants +300 manpower cap per Garrison Hall (up from +75), on top of its existing +0.1 manpower/min per Garrison Hall.",
      "Removed the leftover CRYSTAL build-cost line for Garrison Hall, Rail Depot, Customs House, Radar System, Exchange House, Airport, and the four monument parts — none of them have actually charged CRYSTAL since resource costs moved to permanent slot occupation; their real, current cost (manpower + slots) is unchanged and now displays correctly everywhere.",
      "The structure-info popup's cost card now shows manpower cost for every structure (it previously omitted manpower entirely), and Garrison Hall/Rail Depot's effect descriptions now mention their manpower bonuses instead of only their secondary effects."
    ]
  },
  {
    createdAt: 1785670919000, // 2026.08.02.2
    introducedIn: "2026.08.02.2",
    title: "Build Light Outpost menu no longer shows a FOOD slot cost for your free first 5",
    why: "The button correctly let you build your first 5 Light Outposts for free, but the cost line next to it still said \"1 FOOD slot\" regardless — misleading copy that looked like a hard requirement even when nothing would actually be charged.",
    changes: [
      "The \"Build Light Outpost\" cost line now omits the FOOD slot entirely while you're within your free first 5; it only appears once it actually applies, starting with your 6th outpost."
    ]
  },
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
  }
];
