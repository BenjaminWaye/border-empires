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
  // 2026.07.26.1 ("Expand and Settle now cost manpower") pruned: aged out of the 6-day window during this merge.
  {
    createdAt: 1785115000000, // 2026.07.27.1
    introducedIn: "2026.07.27.1",
    title: "Manpower now gates every structure build",
    why: "Structure build costs already draw manpower (Market, Bank, Farmstead, synthesizers, and everything else), but the build menu only checked gold, so it offered builds you couldn't actually afford until the server rejected them. This closes that gap for the roughly 30 remaining economic structures, matching the fix already shipped for Expand/Settle.",
    changes: [
      "Every economic structure's build/upgrade option (Market, Bank, Farmstead, Camp, Mine, Granary, Census Hall, Clearing House, Caravanary, all three Synthesizers and their Advanced upgrades, Exchange House, Rail Depot, Garrison Hall, Governor's Office, Foundry, Waterworks, Radar System, Airport, Aether Tower, Customs House, and all four monument parts) now checks and displays its manpower cost, not just gold and strategic resources.",
      "The build menu now tells you specifically when you're short on manpower instead of only ever citing gold or a resource."
    ]
  },
  {
    createdAt: 1785118000000, // 2026.07.27.2
    introducedIn: "2026.07.27.2",
    title: "Structures no longer cost gold to build",
    why: "Gold income was cut about 288x in an earlier update so a strong empire could no longer coast on it forever, but every structure's build-gold price stayed at its old, pre-cut value — Bank was still 3,200 gold against an economy earning roughly 10 gold/day/town. That made every structure both far too expensive in gold and, on top of that, also required its full manpower price, a double-tax nobody could realistically pay. Gold now only matters for tech, rush-buys, and a few structures' ongoing upkeep, never for the act of building.",
    changes: [
      "Every structure's build gold cost is now 0 — manpower (and, for some structures, a strategic resource) is the entire build price.",
      "This includes Forts, Siege Outposts, Light/Wooden Outposts, and all four monument parts and their final assemblies, not just the everyday economic buildings.",
      "The four monument assemblies (Imperial Exchange, Worldbreaker Cannon, Aegis Dome, Astral Dock) are no longer mislabeled \"Free after 3 parts\" — they show and require their real manpower + SHARD cost.",
      "Cost displays across the build menu no longer show a stray \"0 gold +\" — the gold clause disappears entirely when it's zero."
    ]
  },
  {
    createdAt: 1785121000000, // 2026.07.27.3
    introducedIn: "2026.07.27.3",
    title: "Garrison Hall and Rail Depot now grant real manpower bonuses",
    why: "Garrison Hall previously did nothing but cost resources and gold upkeep — its old \"+20% defense\" description was never actually implemented. Rail Depot's manpower regen was a flat bonus per depot with no cap on how many you could spam. This wires up the manpower structure tree the economy rewrite was missing: acquiring towns still grows your manpower on its own, but investing in Garrison Halls and a connected Rail Depot network now gives a real, earned way to grow further.",
    changes: [
      "Garrison Hall now grants +150 manpower cap to the town it's built in, unconditionally.",
      "Rail Depot no longer gives a flat manpower regen bonus per depot. Instead, only one Rail Depot may be built per connected-town network, and it amplifies every Garrison Hall already in that network: +75 manpower cap and +0.1 manpower/min, per Garrison Hall, with no cap on how many Garrison Halls can contribute.",
      "Trying to build a second Rail Depot in a network that already has one is now rejected — build menus and the manpower breakdown panel reflect the new bonuses."
    ]
  },
  {
    createdAt: 1785199000000, // 2026.07.28.1
    introducedIn: "2026.07.28.1",
    title: "Rush-buy: finish an in-progress settle or build for gold",
    why: "Manpower is scarce and slow to regenerate by design, but that also means an in-progress Settle or structure build has no way to speed up once started — gold, meanwhile, had nothing to spend on outside of tech and upkeep. Rush-buy gives gold a second job: pay to finish something you're already building right now, priced by how much time is actually left, not the action's full cost.",
    changes: [
      "A tile that's actively settling or has a structure under construction now shows a rush-buy button (⏩🪙) next to its remaining-time countdown in the tile detail panel.",
      "The price scales down as the timer progresses — rushing something nearly done costs almost nothing, rushing something you just started costs close to the full price (anchored at 0.5 gold per manpower point the action costs).",
      "Applies to Settle and every structure build (Fort/Siege tier upgrades included) — not to removals, which can't be rushed."
    ]
  },
  {
    createdAt: 1785202000000, // 2026.07.28.2
    introducedIn: "2026.07.28.2",
    title: "Economy panel: Food/Iron/Crystal/Supply now show slot capacity, not stale stock numbers",
    why: "Food, Iron, Crystal, and Supply stopped being stockpiled quantities and became discrete building/town slots several updates ago, but the economy breakdown panel kept showing them with the old stock/cap/income/upkeep flow layout — numbers that no longer meant anything once those resources became slots. Gold is the only resource left that actually works that way now.",
    changes: [
      "The Food/Iron/Crystal/Supply cards and detail views now show \"used / available\" slots instead of a stockpile amount, with a clear status (free, fully committed, or no access to this resource yet) instead of a gross/upkeep/net rate.",
      "The detail view's old \"Income Sources\" column is replaced with \"Occupied by\" for these four resources, listing which structures and towns are using up a slot right now. The Upkeep column (e.g. a synthesizer's gold upkeep) is unchanged.",
      "Gold keeps its existing stock/cap/income/upkeep display — it's still a real stockpile, not a slot."
    ]
  },
  {
    createdAt: 1785205000000, // 2026.07.28.3
    introducedIn: "2026.07.28.3",
    title: "Food is now purely a slot resource; town growth costs gold + a Food slot",
    why: "Food previously had two overlapping mechanics: the slot system (this update's earlier entry) alongside a leftover production/upkeep flow that towns and Market/Bank/Caravanary still drained every minute, plus a Food-stockpile lump sum to grow a town's tier. That second mechanic is retired entirely — Food now works exactly like Iron/Crystal/Supply, and towns keep growing on gold, the resource the game already asks you to manage everywhere else.",
    changes: [
      "Farmstead's Food bonus, town Food upkeep, and every structure's Food upkeep are gone — Food is consumed only by occupying a slot (towns and FOOD-tagged structures), never by a per-minute drain.",
      "Upgrading a town's tier (Settlement→Town→City→Great City→Metropolis) now costs gold (20/40/80/160 for each step) plus a free Food slot, instead of a Food lump sum — each upgrade past Town also permanently adds +1 to that town's Food slot demand.",
      "If Food supply ever falls short of demand, the newest thing drawing on it (a freshly built structure, or the town itself) goes unfed first — an established town keeps its own Food-gated income and growth ahead of whatever was just built or captured."
    ]
  },
  {
    createdAt: 1785230720833, // 2026.07.28.3
    introducedIn: "2026.07.28.3",
    title: "Fixed: farms, towns, and other overlays floated above hills in 3D mode",
    why: "The 3D renderer's shared surfaceY calculation (used to place buildings, towns, resource icons, and every other tile overlay) already picked up a hill tile's elevation bonus from heightfield.elevationAt(), then added that same bonus a second time for any tile flagged as hills. That doubled the hill's height bump under every overlay on a hill tile, so farms, towns, and resource icons rendered a full bonus-height above the visible hill dome instead of resting on its peak.",
    changes: [
      "Removed the duplicate hills-elevation bonus from the 3D overlay placement formula — buildings, farms, towns, and resource icons now sit directly on the hill's surface instead of floating above it."
    ]
  },
  {
    createdAt: 1785225359405, // 2026.07.28.2
    introducedIn: "2026.07.28.2",
    title: "Fixed: Empire Integrity warning nagged you on every login; added discovery tips",
    why: "The Empire Integrity dismissal was stored under a single global localStorage key with no per-account scoping, so on a shared browser/device a dismissal from one account could leak onto (or get overwritten by) another account, making the warning reappear even after you'd dismissed it. Separately, new players had no in-game explanation of what towns and resource tiles do or why they're worth capturing.",
    changes: [
      "Empire Integrity warning dismissal is now scoped per account, so dismissing it actually keeps it hidden for that login going forward (it still resurfaces after 30 days or once integrity recovers above 90%).",
      "Added a tip the first time you discover a town, and separate tips for the first Food, Iron, Crystal, and Supply resource tile you discover, each explaining why it's worth capturing.",
      "Each discovery tip reappears after 30 days/a season if dismissed (same window as Empire Integrity). A \"Don't show tooltips\" checkbox on the tip lets you mute all discovery tips for that same window in one action."
    ]
  },
  {
    createdAt: 1785215980277, // 2026.07.28.1
    introducedIn: "2026.07.28.1",
    title: "Fixed: hill tiles had no grid square around them in 3D mode",
    why: "Tile gridlines shared the exact same vertex buffer as the main terrain mesh. A hill tile's boundary sits at exactly the same height as the hill dome's own flat outer rim (by design, the dome tapers to zero before reaching the tile edge), so the gridline and the dome's opaque rim geometry occupied the identical 3D position — a coplanar tie the thin grid line consistently lost, leaving every hill tile with no visible grid square around it.",
    changes: [
      "Tile gridlines now use their own slightly-raised position buffer, so they render reliably on top of hill tiles instead of losing a depth tie against the dome mesh.",
      "Verified against isolated hills, scattered hills, and dense adjacent hill clusters — gridlines are now intact around every hill tile in all cases."
    ]
  },
  {
    createdAt: 1785200500000, // 2026.07.27.4
    introducedIn: "2026.07.27.4",
    title: "Fixed: territory ownership overlay didn't follow the hill's shape",
    why: "The 3D hills dome mesh rises above the flat terrain grid, but the ownership overlay (and its fogged-tile variants) drew one flat plane between a tile's 4 corners regardless. On a hill, that plane either sank into the dome or floated as a flat plate poking above/through it, instead of tracing the hill's actual curve.",
    changes: [
      "Owned hill tiles now render their ownership tint draped over the hill's real curved surface, matching the terrain exactly instead of a flat plane cutting through it.",
      "Applies to the normal ownership overlay and both fogged-tile ownership overlays (last-witnessed owner tint on tiles you no longer have vision of)."
    ]
  },
  {
    createdAt: 1785130609961, // 2026.07.27.1
    introducedIn: "2026.07.27.1",
    title: "Fixed: large-empire logins could still stall for 15+ seconds",
    why: "The 2026.07.25.1 duplicate-sign-in fix defined guards on both the client and the gateway, but neither was actually wired into the real login path — the client kept sending sign-in through its original unguarded code, and the gateway never checked its guard flag. A duplicate sign-in message (e.g. a flaky mobile connection triggering a reconnect while the first attempt was still finishing) could still run two full, concurrent login pipelines against the same connection, doubling snapshot-build work and sometimes leaving the connection stuck on the loading screen indefinitely.",
    changes: [
      "The client's duplicate-sign-in guard is now actually used on every sign-in attempt, including the very first one after opening Google sign-in.",
      "The gateway now also drops a duplicate sign-in message on the same connection instead of processing it a second time in parallel.",
      "Fixed a related gateway bug where a player's connection was permanently treated as \"already has data cached\" after their first login, even after a disconnect cleared that cache — a flaky connection with repeated drops could end up requesting an empty world snapshot with nothing to fill it back in."
    ]
  },
  {
    createdAt: 1785147877000, // 2026.07.27.2
    introducedIn: "2026.07.27.2",
    title: "Fixed: ownership overlay and buildings invisible on hills in 3D mode",
    why: "The 3D hills dome mesh (added 2026.07.25.1) rose 0.45 world-units above the base terrain, but the ownership overlay and all building/structure markers used Y positions from the heightfield grid — which excludes hills. The ownership overlay failed the depth test against the closer dome geometry and was never drawn, and buildings on hill tiles appeared to sink underground instead of sitting on the surface.",
    changes: [
      "Ownership overlays (settled and frontier territory colors) now always render on top of the hill mesh, matching the 2D canvas behavior where ownership is a flat fill on top of terrain.",
      "Towns, forts, resources, economic structures, and all other tile markers now correctly rise with the hill dome on hills tiles instead of being hidden underneath."
    ]
  },
  {
    createdAt: 1785129932105, // 2026.07.27.1
    introducedIn: "2026.07.27.1",
    title: "Fixed: unexplored-tile waypoints stopped working entirely",
    why: "An unrelated merge on client-action-flow.ts accidentally reverted the unexplored-tile waypoint feature back to its pre-feature state — clicking an unexplored tile went back to silently doing nothing (no menu, no selection) instead of opening the \"Unexplored\" menu with an Expand Here option.",
    changes: [
      "Restored the unexplored-tile menu and waypoint action handling that were silently dropped by an earlier merge."
    ]
  },
  {
    createdAt: 1785096000000, // 2026.07.26.1
    introducedIn: "2026.07.26.1",
    title: "Fixed seeing darkness after a new season starts",
    why: "When a new season rolled over the saved map camera location from the old season was never cleared. On the next page load the stale coordinates were restored and the player saw darkness instead of their new base.",
    changes: [
      "The persisted camera location is now cleared on season rollover so the next load centers on your new home tile instead of stale old-season coordinates."
    ]
  },
  // 2026.07.25.3 ("Hills are now a real strategic prize"), 2026.07.25.2
  // ("Fixed: waypoints to distant unexplored tiles..."), 2026.07.25.1
  // ("Faster login for large empires"), 2026.07.24.3 ("Watchtowers are now
  // rarer"), 2026.07.24.1 ("New structure: Watchtowers" and "Hills terrain:
  // +1 vision, visible in 2D and 3D"), and 2026.07.23.1 ("Terrain now blocks
  // and limits vision") all pruned: aged out of the 6-day window during
  // this merge.
  {
    createdAt: 1785200000000, // 2026.07.27.3
    introducedIn: "2026.07.27.3",
    title: "Fixed: login stalls on mobile reduced by ~50%",
    why: "Every login opened two WebSocket connections (control and bulk) and ran the full heavyweight login pipeline on both — doubling prepare-player, bootstrap-subscribe, and snapshot-build work on the CPU-constrained staging box. The bulk channel only needs identity resolution and socket attachment; everything else was redundant.",
    changes: [
      "The bulk WebSocket channel now skips the prepare-player, bootstrap-subscribe, live-subscribe, and snapshot-build steps during login, cutting per-login CPU work roughly in half.",
      "Login stalls for large empires should be significantly shorter on mobile and slow connections."
    ]
  },
  {
    createdAt: 1785097225841, // 2026.07.26.2
    introducedIn: "2026.07.26.2",
    title: "Snappier actions during heavy fights",
    why: "Closing a tile menu or clicking a non-muster tile sent a pointless \"stop watching muster\" request to the server every single time — even when you were never watching one. During rapid attacking this fired several times a second, and each one cost the server a full command round-trip that always failed, adding to server-side delays that could make combat results arrive late.",
    changes: [
      "The client now only tells the server to stop watching a muster flag when it actually started watching one.",
      "Server-side: muster watch toggles are no longer written to the command database at all — they are view state, not game actions — eliminating a steady stream of database errors."
    ]
  },
  {
    createdAt: 1785215000000, // 2026.07.28.3
    introducedIn: "2026.07.28.3",
    title: "Discovery tips for docks and barbarians; Storybook catalog for reviewing all tip copy",
    why: "Docks and barbarian territories are important strategic features but had no in-game explanation when first encountered. A Storybook story now renders every discovery tip from the source data so copy can be reviewed in one place.",
    changes: [
      "Added a one-time discovery tip for the first dock you discover, explaining that docks connect across the sea for launching attacks and expanding onto distant shores.",
      "Added a one-time discovery tip for the first barbarian tile you discover, explaining that barbarian camps spawn patrols and that clearing them yields gold and expands your border.",
      "Added a Storybook story (UI/Discovery Tips) that renders every discovery tip from the source data — copy changes to client-discovery-tips.ts automatically update the story."
    ]
  },
  {
    createdAt: 1785215100000, // 2026.07.28.4
    introducedIn: "2026.07.28.4",
    title: "New season now requires 5 players to vote",
    why: "Anyone could unilaterally trigger a new season for every player with a single click. That made accidental early rollovers too easy, and gave the last player standing less incentive to keep playing — the season could end at any moment on someone else's whim.",
    changes: [
      '"Start New Season" is replaced by "Vote for New Season". Each player can vote once; the season starts when 5 unique players have voted.',
      "Once you vote, the button shows the current vote count (e.g. 'Vote cast (3/5)') and is disabled.",
      "Votes are cleared when a new season actually begins, so every post-rollover season requires a fresh vote."
    ]
  },
  {
    createdAt: 1785215200000, // 2026.07.28.5
    introducedIn: "2026.07.28.5",
    title: "Season-end Misc tab with deadliest tile and longest road",
    why: "The season end screen now tracks which tile saw the most manpower lost in battle and the longest continuous road, giving players a glimpse into the season's unique history.",
    changes: [
      "Added a Misc tab to the season end overlay showing the deadliest tile (most manpower lost in a single battle) and the longest road (most tiles connected by road network).",
      "Tracks manpower losses per tile across the entire season."
    ]
  },
  {
    createdAt: Date.now(),
    introducedIn: "next",
    title: "Victory countdown now shows immediately when a threshold is met",
    why: "When a player met a victory condition threshold (e.g. controlling 50% of towns), the leaderboard showed \"Threshold met\" but never displayed the 24-hour hold countdown until the next day — because the timer enrichment was discarded on the first recompute.",
    changes: [
      "The leaderboard now shows \"Winning in 23h 59m unless stopped\" (and ticks down) from the moment a victory threshold is first met.",
      "The victory hold alert overlay also fires immediately instead of being silent for up to 24 hours."
    ]
  },
  {
    createdAt: Date.now(),
    introducedIn: "road-hill-wrap",
    title: "Roads follow hills, look more realistic",
    why: "Roads previously sat flat on the terrain, cutting straight through hill domes instead of rising over them. The road surface also lacked detail, reading as a simple tan strip.",
    changes: [
      "Roads now rise and fall with hill terrain, wrapping over the dome surface instead of clipping through it.",
      "Road surfaces are now cobblestone with individual stones, mortar gaps, wheel ruts, grass edges, puddles, and directional stone shading."
    ]
  },
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
    createdAt: Date.now(),
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
    createdAt: Date.now(),
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
    createdAt: Date.now(),
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
    createdAt: Date.now(),
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
    createdAt: Date.now(),
    introducedIn: "town-food-slot-demand",
    title: "Towns now draw 4 food slots each",
    why: "Towns were only drawing 2 food slots while they scaled gold/income with tier, so growth never stressed your farming network the way it should. Raising base town demand to 4 makes feeding a growing empire an ongoing land-use decision rather than a one-time setup.",
    changes: [
      "Each TOWN now consumes 4 FOOD resource slots (up from 2) to stay fed, so a growing empire needs proportionally more farms and fishing.",
      "SETTLEMENTs still draw 0 food slots; CITY, GREAT_CITY, and METROPOLIS each add +1 on top of the town base, matching how their income scales."
    ]
  },
  {
    createdAt: Date.now(),
    introducedIn: "town-vision-bonus",
    title: "Towns reveal one extra tile of vision",
    why: "Towns are the most valuable, permanent things you build, but they revealed no more of the map than an ordinary claimed tile — so defending your core gave you no strategic awareness around it. Letting each settled town's own reveal reach one tile further rewards building up your home territory.",
    changes: [
      "Every SETTLED town tile (TOWN and above) now reveals its surroundings one tile further than a plain owned tile — its own reveal is radius+1.",
      "Settlements (SETTLEMENT tier) are unchanged and do not grant the extra ring.",
      "Applies consistently to the map you see on login, the tile updates streamed as you play, and barbarian visibility."
    ]
  },
  // Older entries (2026.07.22.1 and earlier) trimmed: the release-day
  // window test only keeps entries within the latest 6 days of the newest
  // entry's createdAt -- see git history for the full changelog.
];
