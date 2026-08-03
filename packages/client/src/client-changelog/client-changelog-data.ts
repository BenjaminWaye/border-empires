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
  // no longer cost gold to build"), and 2026.07.27.3 ("Garrison Hall and
  // Rail Depot now grant real manpower bonuses") pruned: aged out of the
  // 6-day window during this merge.
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
  // 2026.07.27.1 ("Fixed: large-empire logins could still stall for 15+
  // seconds") and 2026.07.27.2 ("Fixed: ownership overlay and buildings
  // invisible on hills in 3D mode") pruned: aged out of the 6-day window
  // during this merge.
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
    createdAt: Date.now(),
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
    createdAt: Date.now(),
    introducedIn: "wooden-fort-no-iron-build",
    title: "Wooden Fort no longer charges a lump-sum iron cost to build",
    why: "Building a Wooden Fort showed a 15-iron requirement left over from before the manpower-economy rewrite moved resource costs onto permanent slot occupation — the same stale-cost class the prior update cleaned off the crystal structures. A Wooden Fort's real cost is manpower plus its permanent IRON slot, so the iron line is gone.",
    changes: [
      "Building or upgrading to a Wooden Fort no longer deducts 15 iron up front — its cost is manpower plus the 1 IRON slot it permanently occupies."
    ]
  },
  {
    createdAt: Date.now(),
    introducedIn: "economy-slot-upkeep-no-daily-flow",
    title: "Economy panel no longer shows slot upkeep as a negative daily flow",
    why: "Since Food/Iron/Crystal/Supply became slots, a structure's upkeep is the slot it permanently occupies — but the detail cards were still also showing those structures as a per-day flow cost (a 4-outpost empire read \"Light Outpost · 4  -576.0/day\" right below the same 4 slots listed under \"Occupied by\"). That was the same cost counted twice, and it read like the game was draining a food stockpile that no longer exists.",
    changes: [
      "The Food/Iron/Crystal/Supply cards no longer have a separate Upkeep column — slot upkeep for these resources is fully represented by the slot count already shown in \"Occupied by\". Cross-resource flow costs (e.g. a synthesizer's gold upkeep) still appear, but only once, on the GOLD card.",
      "The \"Empire upkeep:\" summary line at the top now shows only gold upkeep — the one resource that still works as a daily flow — instead of also quoting per-day food/iron/supply/crystal figures."
    ]
  },
  // Older entries (2026.07.22.1 and earlier) trimmed: the release-day
  // window test only keeps entries within the latest 6 days of the newest
  // entry's createdAt -- see git history for the full changelog.
];
