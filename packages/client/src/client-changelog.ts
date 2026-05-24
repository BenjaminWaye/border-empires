import type { ClientState, storageSet } from "./client-state.js";

export const CLIENT_CHANGELOG_STORAGE_KEY = "border-empires-client-changelog-seen-v1";
const CLIENT_CHANGELOG_SCROLL_SELECTOR = ".changelog-modal-scroll";

export type ClientChangelogEntry = {
  introducedIn: string;
  title: string;
  why: string;
  changes: string[];
};

export type ClientChangelogRelease = {
  version: string;
  title: string;
  summary: string;
  entries: ClientChangelogEntry[];
};

// Update this object for every user-facing client release.
export const LATEST_CLIENT_CHANGELOG: ClientChangelogRelease = {
  version: "2026.05.24.4",
  title: "What's New",
  summary: "All four outpost-family structures (Light Outpost, Siege Outpost, Siege Tower, Dread Tower) now share sweep and a target-based attack aura at radius 5. Auto-attack toggle removed.",
  entries: [
    {
      introducedIn: "2026.05.24.4",
      title: "Outpost-family sweep + aura overhaul",
      why: "Sweep and aura bonuses now cover all four outpost-family structures uniformly. The old 1-tile auto-attack loop has been removed in favour of the sweep system, which offers the same automation with explicit budget control.",
      changes: [
        "Sweep is now available on all four outpost-family structures: Light Outpost, Siege Outpost, Siege Tower, and Dread Tower. Each has its own rechargeable budget (0–300) and a Start Sweep / Stop Sweep toggle.",
        "Removed 'Enable Auto Attack' / 'Cancel Auto Attack' from siege outpost panels. The SET_SIEGE_OUTPOST_AUTO_ATTACK command has been removed from the protocol entirely — the sweep system replaces it.",
        "Attack aura is now target-based at radius 5 (was origin-based at radius 2). The bonus applies when the tile being attacked is within Chebyshev 5 of any friendly outpost-family structure, regardless of where the attacker is standing.",
        "Per-variant aura multipliers: Light Outpost 1.25×, Siege Outpost 1.6×, Siege Tower 1.8×, Dread Tower 2.0×. When multiple auras overlap the maximum multiplier wins (no stacking).",
        "Light Outpost sweep state (sweepBudget, sweepActive) is now tracked on the economic structure and initialised at completion (budget=300, active=false)."
      ]
    },
    {
      introducedIn: "2026.05.24.3",
      title: "Siege outpost sweep",
      why: "Manual micro on outposts was tedious for players who built forward siege lines. Sweep adds a structure-bound budget (0–300) that recharges at the same rate as your global manpower. Toggle it on and the outpost attacks the closest enemy tile in a 5-tile Chebyshev radius once per tick, deducting 60 from the budget each time. When the budget runs dry the outpost pauses; when there are no enemies in range it deactivates and needs a manual re-toggle.",
      changes: [
        "Siege outpost panel: 'Start Sweep' / 'Stop Sweep' toggle button and a budget progress bar (0–300).",
        "Selecting an active outpost now shows an orange 11×11 sweep-radius highlight on the 3D map.",
        "Budget recharges at the player's MP-regen-per-minute rate but is rate-limiting only — it does not generate global manpower.",
        "New outposts start with sweepBudget=300, sweepActive=false (immediately usable after build completes)."
      ]
    },
    {
      introducedIn: "2026.05.24.2",
      title: "Encirclement — cut-off frontier tiles decay in 60 s",
      why: "Players reported that cleaning up enemy tiles scattered inside their territory was tedious. Encirclement makes isolated frontier tiles self-destruct: a frontier tile with no 8-neighbor path back to your settled core goes into a 60-second countdown, shown as a blinking overlay and a 'Cut off from supply' warning in the tile panel. Cut-off tiles cannot launch attacks. The natural 10-minute decay still applies; encirclement only shortens it.",
      changes: [
        "Simulation: when a tile changes ownership, the sim re-checks 8-neighbor connectivity for all affected player frontier tiles in the changed region. Disconnected tiles get frontierDecayAt = now + 60 s (min with any existing shorter timer). Reconnected tiles have their timer cleared immediately with no debt.",
        "Simulation: attack commands from a cut-off (blinking) frontier tile are rejected with ORIGIN_CUT_OFF.",
        "Client: the tile panel shows 'Cut off from supply — disappears in Xs' as a warning header for blinking frontier tiles."
      ]
    },
    {
      introducedIn: "2026.05.24.1",
      title: "Large connected-town empires no longer stall AI ticks",
      why: "Connected-town bonuses were being computed by walking the same settled-land component once per town. On a large empire, an economy update could rebuild the same network thousands of times and also materialize huge connected-town name lists, blocking the simulation event loop and making AI worker replies look like 30s planner stalls.",
      changes: [
        "Simulation now builds connected-town components once per player economy refresh and derives every town's connected count from that shared component.",
        "Connected-town bonuses and counts are preserved, while giant connected-town name lists are capped on runtime tile payloads and skipped entirely for internal economy math."
      ]
    },
    {
      introducedIn: "2026.05.23.7",
      title: "Town Production keeps connected-town bonuses on stale tile detail",
      why: "The prior fix still left one fallback path in the gateway: when the cached town's isFed value disagreed with the gateway's derived fed-state, buildSnapshotTileDetail recomputed goldPerMinute and cap locally. That local formula only knew base production, support, market, and bank, so a town showing '3 connected towns: +120% gold production' could still render Production: 2.00/m and Stored yield cap 960 instead of the simulation's 4.4/m and 2112.",
      changes: [
        "Gateway tile detail now preserves finite townJson.goldPerMinute and townJson.cap from the simulation regardless of fed-state mismatch; the gateway can still update support/fed display fields, but it no longer rewrites production or cap.",
        "Updated the stale-fed-state gateway tests so they no longer expect the gateway to invent town production, and added helper plus WebSocket tile-detail regressions matching the Gloamspire shape: isFed corrected to true while goldPerMinute=4.4 and cap=2112 survive into yieldRate/yieldCap."
      ]
    },
    {
      introducedIn: "2026.05.23.6",
      title: "Release notes stay limited to the current week",
      why: "The client changelog had accumulated every release note since it was introduced, so the bundle still shipped old April and early-May entries even though the popup filtered most of them at runtime.",
      changes: [
        "Pruned the bundled changelog entries to the current seven-day release window.",
        "Added regression coverage so future changelog updates fail if entries older than the current week are kept in the client bundle."
      ]
    },
    {
      introducedIn: "2026.05.23.5",
      title: "Login bootstrap is no longer starved by fog admin refreshes",
      why: "A production debug trace on 2026-05-23 showed login wall-time of 60.6s with bootstrap_subscribe alone taking 45.9s, while the gateway event loop p99 was 21.3s and the simulation was idle (sim_rpc_p99=0). Each TILE_DELTA_BATCH for a player whose session had fog disabled awaited a synchronous full-world resubscribe; with AI commands firing every second this monopolized the event loop and starved incoming logins.",
      changes: [
        "Gateway: fog-admin live refresh now runs through a per-player coalescing scheduler (max one in flight, FOG_LIVE_REFRESH_MIN_INTERVAL_MS=1s) instead of being awaited inside the TILE_DELTA_BATCH handler. Fog admin views may lag by up to ~1s between refreshes; gameplay logins no longer wait on those refreshes.",
        "Gateway: every AUTH explicitly resets session.fogDisabled=false so a reconnecting fog admin starts with fog ON and must opt in again.",
        "Client: Firebase sign-in clears the persisted map-reveal preference (be-map-reveal:*) so the admin must re-toggle reveal each session — prevents a stale tab from auto-re-enabling reveal on connect."
      ]
    },
    {
      introducedIn: "2026.05.23.4",
      title: "3D map pan is smoother",
      why: "A Chrome performance trace of normal play showed the renderer main thread blocked ~89% of the time during pan, with three.js's computeVertexNormals (and its BufferAttribute.fromBufferAttribute read path) plus per-vertex Array.filter allocations dominating the heightfield rebuild. Together they accounted for ~3s of self-time across a 32s trace, and the filter chain churned ~30k array allocations per rebuild that fed back into GC.",
      changes: [
        "Heightfield rebuild now accumulates vertex normals by reading the positions Float32Array directly (same face-cross-product algorithm as three.js's computeVertexNormals, just without the BufferAttribute round-trip).",
        "Per-vertex category counting in the rebuild loop replaces three chained Array.filter() calls (and their closures) with inline boolean math — no allocations per vertex, identical position/color outputs."
      ]
    },
    {
      introducedIn: "2026.05.23.3",
      title: "Server build SHA visible in the bridge debug card",
      why: "When a feature works on staging but not prod (or vice versa), the question that's hard to answer is 'is your client running the same commit as the gateway+sim?'. The card showed Client build but had no parallel value for the server, so a stale-server-vs-fresh-client deploy state was invisible.",
      changes: [
        "Deploy scripts (deploy-staging-all.mjs, deploy-prod-all.mjs) now pass --env BUILD_SHA=<targetSha> on fly deploy; the gateway reads it at startup and includes serverBuildSha on every INIT payload.",
        "Bridge debug card adds a Server build line (first 8 chars, matches the Client build format) and flags ⚠ mismatch when the SHA does not start with CLIENT_BUILD_VERSION.",
        "Copy Bridge Debug payload now includes both Client build and Server build lines so a pasted snapshot is self-diagnosing for client/server skew."
      ]
    },
    {
      introducedIn: "2026.05.23.2",
      title: "Tile inspector Production stops dropping the connected-town bonus",
      why: "The gateway's tile-detail builder was unconditionally recomputing goldPerMinute and cap from a stripped-down local formula — baseGoldPerMinute * supportRatio * marketMult * bankMult — and writing that value into the townJson sent to the client. That formula doesn't apply connectedTownBonus, townPopulationMultiplier, firstThreeTownMult, incomeMultiplier, PASSIVE_INCOME_MULT, or the +1 bank flat, so an owned town with 3 connected towns (+120%) showed Production: 2.00/m and gold cap 960 even though the sim correctly computed 4.4/m and cap 2112. Every sim-side fix shipped over the last day computed the right number — the gateway then threw it away.",
      changes: [
        "buildSnapshotTileDetail now trusts the sim's authoritative goldPerMinute and cap when the cached snapshot's isFed matches the gateway's freshly-derived isFed (i.e. the snapshot is in sync). The local recompute path is preserved only as a fallback when isFed disagrees, so the existing 'gateway corrects stale fed state from current neighbors' tests still pass.",
        "Added a gateway regression test for the prod scenario: a TOWN-tier town with 3 connected towns shipping goldPerMinute=4.4 / cap=2112 now survives buildSnapshotTileDetail end-to-end instead of being silently rewritten to 2 / 960."
      ]
    },
    {
      introducedIn: "2026.05.23.1",
      title: "3D world fills out: late-game structures, fur tripods, unfed-town shield, and a Storybook asset viewer",
      why: "Two gaps were visible to anyone playing on the 3D map: only 9 of the 38 structure kinds had hand-modeled 3D representations, and the unfed-town warning glyph didn't read as 'food problem'. The fur drying rack also didn't match its 2D pictogram. This batch closes the SVG↔3D gap across every kind, redesigns the fur tripod (and the matching camp drying frame) to look like a real tepee with a stretched hide, and replaces the floating warning triangle with a 🍞-on-a-shield badge so the meaning lands instantly.",
      changes: [
        "20 new 3D structures: Bank, Aether Tower, Aegis Dome, World Engine, Imperial Exchange, Airport, Caravanary, Customs House, Exchange House, Garrison Hall, Governor's Office, Rail Depot, Radar System, Foundry, Advanced Ironworks, Fur Synthesizer + Advanced, Crystal Synthesizer + Advanced, Astral Dock. Every OptimisticStructureKind backed by an SVG overlay now has a procedurally-built 3D silhouette in StructureOverlay.",
        "IRONWORKS and ADVANCED_IRONWORKS redesigned as synthesizer chambers (chamber + iron-glow window + tubes) to match the FUR/CRYSTAL synthesizer family — ironworks is a synthesizer in border-empires, not a forge. FOUNDRY keeps its forge silhouette (twin chimneys + glowing slag pile) so the two read as distinct.",
        "Fur resource 3D redesigned: rectangular drying frame replaced with a tepee tripod — three thicker posts leaning to a common apex with a small dark binding at the top and a stretched diamond hide (OctahedronGeometry scaled to a flat diamond) draped on the front. Camp structure's drying frame now uses the same tripod.",
        "Unfed-town badge swapped from a generic warning triangle to a slowly-bobbing canvas-textured shield carrying the in-game 🍞 food glyph with a red diagonal slash drawn across it. Per-instance bob phase offset so a cluster of unfed towns doesn't lock-step.",
        "Internal: structure-overlay refactored from 1457 lines into a per-family composition (builder + economic/late-game/civic/infrastructure/industrial files, each well under 500 lines).",
        "Internal: a new @border-empires/storybook workspace package catalogs every 2D SVG and every 3D overlay layer in Storybook 10.4 with side-by-side variant comparisons — use `pnpm --filter @border-empires/storybook dev` to browse the catalog."
      ]
    },
    {
      introducedIn: "2026.05.22.7",
      title: "Attack win chance result no longer reopens into loading",
      why: "The client accepted ATTACK_PREVIEW_RESULT from the gateway, stored the authoritative win chance, then re-rendered the open enemy tile menu through the normal fresh-open path. That path immediately started another preview request and cleared the accepted result before it could render, so the action row stayed on \"Calculating win chance...\" even when production had answered.",
      changes: [
        "Network-driven action menu re-renders now reuse the just-accepted attack preview instead of starting a new request.",
        "Added regression coverage for an open enemy action menu receiving a current attack preview result."
      ]
    },
    {
      introducedIn: "2026.05.22.6",
      title: "Clockwork Stipend trickle shows up in income sources",
      why: "The trickle was already being applied to the stockpile each tick, but it was never folded into strategicProductionPerMinute or the economy breakdown, so the income panel showed 0/min for the resource even while the stockpile climbed. Players had no way to attribute the income to the domain.",
      changes: [
        "buildPlayerUpdateEconomySnapshot now reads chosenTrickleRateForPlayer and adds the rate to both strategicProductionPerMinute[resource] and a 'Clockwork Stipend' bucket under economyBreakdown[resource].sources.",
        "Regression test pins the SUPPLY case and verifies the bucket isn't added to other resources."
      ]
    },
    {
      introducedIn: "2026.05.22.6",
      title: "Locked trickle resource appears on the domain detail card",
      why: "After picking SUPPLY (or IRON/CRYSTAL) for Clockwork Stipend, the detail card just showed 'Chosen' with no indication of which resource was locked. The owned-summary card carried the suffix but the detail card — the one you click into — did not, forcing a second navigation to confirm the pick.",
      changes: [
        "renderDomainDetailCardHtml now accepts chosenTrickleResource and renders a 'Your pick: SUPPLY (+0.20/min, locked)' section under the description when the player owns the domain and the resource is one this domain offered.",
        "Same gate as the owned-summary card: a future narrower trickle table can't claim credit for a pick made on a different domain."
      ]
    },
    {
      introducedIn: "2026.05.22.5",
      title: "Restore Fog after reveal clears the revealed tiles",
      why: "TILE_SNAPSHOT_REPLACE handling early-returned on an empty tiles array, so when the gateway sent the fog-on snapshot back after a reveal toggle, any visibility-zero slice left the previously revealed tiles in place and the map kept rendering them.",
      changes: [
        "applyGatewayInitialState now treats an empty tiles array as a valid replacement and clears state.tiles + discoveredTiles + incomingAttacksByTile + pendingCollectVisibleKeys, while still treating a missing tiles field as a no-op so partial INIT payloads do not wipe state.",
        "Regression test covers both the empty-replacement case and the missing-field no-op."
      ]
    },
    {
      introducedIn: "2026.05.22.4",
      title: "Clockwork Stipend resource picks no longer dropped at the gateway",
      why: "ClientMessageSchema for CHOOSE_DOMAIN did not declare the chosenTrickleResource field. Zod's default object mode silently strips unknown keys, so the gateway parsed an empty payload, forwarded an empty payload, and the sim rejected with 'trickle resource choice required' even when the player had picked IRON/SUPPLY/CRYSTAL. The schema now declares the field as an optional TRICKLE_RESOURCE_KEYS enum, with a regression test that fails loud if it's removed.",
      changes: [
        "ClientMessageSchema.CHOOSE_DOMAIN now declares chosenTrickleResource: z.enum(TRICKLE_RESOURCE_KEYS).optional(), so the field survives the gateway's safeParse.",
        "Regression test verifies the field round-trips and that unknown resource keys are rejected up front."
      ]
    },
    {
      introducedIn: "2026.05.22.4",
      title: "Domain and tech rejections surface as banner alerts",
      why: "When the server rejected a domain pick — for example Clockwork Stipend returning 'trickle resource choice required' — the only feedback was a single line in the activity feed. The button quietly reverted to 'Choose Tier N' and players assumed the click was broken. Frontier/diplomacy/build rejections already use banner alerts, so domain and tech now match that pattern.",
      changes: [
        "DOMAIN_INVALID and TECH_INVALID rejections now raise a 12-second 'Domain pick failed' / 'Research failed' banner alongside the existing feed entry.",
        "The default 'Error CODE: message' fallback string is replaced with a friendlier 'Domain pick failed: …' / 'Research failed: …' for these codes."
      ]
    },
    {
      introducedIn: "2026.05.22.3",
      title: "Fog admin map-reveal toggle works on production and is no longer named staging-only",
      why: "The client suppressed the reveal-map toggle on production hostnames even when the server told the session it was allowed to toggle fog, which blocked screenshotting prod-only AI state. The server-side FOG_ADMIN_EMAIL gate already scopes the capability to a single account, so the client hostname check was redundant. While the gate was being removed, every staging-prefixed symbol around it was renamed to match the actual scope.",
      changes: [
        "Map reveal availability now relies solely on the server-issued canToggleFog flag and no longer checks the hostname.",
        "Renamed the helper module, state fields, storage key, CSS class, and data attribute from the staging-only naming (stagingMapReveal*) to the hostname-agnostic name (mapReveal*) so the code matches the actual scope.",
        "Existing fog admin browsers will see their staged toggle preference reset once (storage key changed from be-staging-map-reveal to be-map-reveal); re-toggling restores it."
      ]
    },
    {
      introducedIn: "2026.05.22.2",
      title: "Stored yield can't get stranded above the cap anymore",
      why: "After the prior fix routed FetchTileDetail through tileDeltaFromState, the on-open inspector still showed e.g. \"Stored yield: 2105 / 960\" on a town that no longer had a market. Root cause: buildTileYieldView omitted the `yield` field whenever the live buffer rounded to ≤ 0.0001 (the common case right after an upkeep tick drained the buffer). The gateway's shallow `{ ...cached, ...fresh }` merge then preserved whatever stale buffer the client had cached from when the town's cap was higher.",
      changes: [
        "buildTileYieldView now always emits `yield` (with `gold: 0` when the live buffer is empty) for any tile that can produce gold or strategic resources, so fresh tile-delta and FetchTileDetail responses authoritatively overwrite stale cached buffer values instead of leaving them untouched."
      ]
    },
    {
      introducedIn: "2026.05.22.1",
      title: "Attack win chance loading stops retrying itself",
      why: "The watchdog for stranded attack preview requests did fire, but its menu re-render reopened the same enemy tile through the normal fresh-preview path. That immediately started another request, cleared the timeout state, and put the row back into \"Calculating win chance...\".",
      changes: [
        "Timeout-driven action menu re-renders now reuse the computed preview-unavailable state instead of starting another fresh preview request.",
        "Normal player-opened enemy tile menus still request fresh authoritative odds.",
        "Added regression coverage that fails when the timeout re-render restarts the preview request loop."
      ]
    },
    {
      introducedIn: "2026.05.21.7",
      title: "Full-map reveal is chunked for high-player fanout",
      why: "The old reveal path sent one full tile snapshot per requester. When many players revealed the whole map, the gateway could retain and serialize many huge payloads at once, causing memory pressure.",
      changes: [
        "Reveal Full Map now requests a dedicated reveal stream and applies tile chunks incrementally, keeping the regular control websocket clear.",
        "The gateway builds one reusable chunk payload set for concurrent reveal requests, pre-serializes each chunk once for fanout across all viewers, and clears the set when live tile deltas arrive instead of retaining full reveal snapshots per player.",
        "Reveal requests are rate-limited per player and bounded by a hard concurrent-stream cap so a fanout wave can't saturate the gateway event loop, and reveal-map metrics (build time, payload bytes, active streams, chunks sent, cache entries) are exposed via /metrics.",
        "The simulation no longer stores explicit full-visibility subscribe snapshots in its per-player snapshot cache."
      ]
    },
    {
      introducedIn: "2026.05.21.6",
      title: "Attack menu win chance survives hover-vs-menu races",
      why: "Pending preview request ids were tracked globally, so a hover preview for one tile would overwrite the menu's pending id and cause the menu's gateway response to be silently dropped — leaving the 4 second watchdog to fall back to \"preview unavailable\" even though the gateway had returned the real odds.",
      changes: [
        "Pending attack preview request ids are now tracked per (from, to) attack key, so hover previews for one tile cannot invalidate the menu's request for a different tile.",
        "Gateway responses are accepted as long as they match the latest request id for that specific attack key; only same-key superseded responses are dropped.",
        "Added a regression test for the cross-target race the prior implementation dropped."
      ]
    },
    {
      introducedIn: "2026.05.21.5",
      title: "Tile inspector refreshes Production and gold cap on open",
      why: "REQUEST_TILE_DETAIL went through exportTilesInAreaForPlayer → domainTileToWireDelta, which serialized the in-memory tile state directly. Between full snapshot rebuilds the in-memory town.goldPerMinute and town.cap stayed at whatever the last rebuild had written, and this code path never touched buildTileYieldView or the connected-town refresh — so the owned-town inspector kept reporting a stale Production row and gold cap even after the previous fix to the event-driven tile delta emission. The response also didn't include yield_rate_json / yield_cap_json / yield_json at all, so the merged client snapshot fell back to whatever cached yield fields it had.",
      changes: [
        "FetchTileDetail now serializes its tiles through tileDeltaFromState, so the response carries refreshed town.goldPerMinute and town.cap plus the matching yield_rate_json, yield_cap_json, and yield_json. Opening an owned town's action menu now sees current support/fed/market/connected-town state without waiting for a full snapshot rebuild or an event-driven tile delta."
      ]
    },
    {
      introducedIn: "2026.05.21.4",
      title: "Seed Granary growth buff",
      why: "Seed Granaries had no gameplay effect beyond the build prompt; they now apply a real growth multiplier to the closest 5 granaries on their island.",
      changes: [
        "Each Seed Granary buffs up to 5 closest owned Granary/Seed Granary tiles on the same island to 1.30x population growth.",
        "The Seed Granary's own tile counts as slot 1; ties on distance break lexicographically by tile key.",
        "Cross-island granaries are not buffed."
      ]
    },
    {
      introducedIn: "2026.05.21.4",
      title: "Imperial Exchange Levy and Worldbreaker Shot",
      why: "Both monuments existed without abilities; the levy seizes a quarter of each rival's stock and the shot razes a single target.",
      changes: [
        "Imperial Exchange Levy seizes 25% of each non-allied rival's chosen resource (FOOD, IRON, CRYSTAL, or SUPPLY) for 200 CRYSTAL on a 30 minute cooldown — allies are spared.",
        "Worldbreaker Shot destroys the target tile's economic structure (if not yours) and removes 30% of a settled town's population — no cap, and demotes the city tier one step (floored at TOWN) — for 500 CRYSTAL on a 60 minute cooldown.",
        "Worldbreaker Shot is blocked when the target tile is within 30 tiles of an enemy's active, powered Aegis Dome.",
        "Both abilities require the matching tech (Exchange Levy Writs / Worldbreaker Fire) and an Aether Tower powering the monument."
      ]
    },
    {
      introducedIn: "2026.05.21.4",
      title: "Aether Towers power Airports",
      why: "Airports were free-standing and Oil had no producer; gating Airports on a nearby Aether Tower restores the design intent and moves the upkeep onto Crystal, which the empire can actually produce.",
      changes: [
        "Airports now require an active player-owned Aether Tower within 30 tiles to bombard.",
        "Airport upkeep and bombard cost switched from Oil to Crystal.",
        "New isStructurePowered helper gates future monument abilities on Aether Tower coverage."
      ]
    },
    {
      introducedIn: "2026.05.21.4",
      title: "Tech-tree expansion and stub cleanup",
      why: "Eight dead unlock stubs were cluttering the tech tree with no backing mechanic; the three worth keeping now have real entries and the others are gone.",
      changes: [
        "Added Seedline Granaries (tier 4), Exchange Levy Writs (tier 8), and Worldbreaker Ignition (tier 8).",
        "Removed Broker Market, Treasury House, Weather Engine, Advanced Foundry, Catalytic Refiner, Refinery, Lockworks Port, and Chartered Port stubs — none of those had any backing sim logic in the rewrite.",
        "Seed Granary structure type is wired through shared types and the simulation runtime; gameplay effects land in follow-up work."
      ]
    },
    {
      introducedIn: "2026.05.21.4",
      title: "FUEL_PLANT structure removed",
      why: "Refinery (FUEL_PLANT) was the only producer of OIL, and the Refinery unlock stub was already deleted. Keeping the structure type and its OIL output wired created dead code with no path to be built.",
      changes: [
        "Removed FUEL_PLANT from shared types, costs, placement metadata, sim economy, gateway upkeep map, and all client build actions.",
        "Removed associated FUEL_PLANT_BUILD_GOLD_COST, FUEL_PLANT_GOLD_UPKEEP, and FUEL_PLANT_OIL_PER_DAY constants.",
        "OIL is now an unused strategic resource (no producers, no consumers) and is a candidate for removal in a follow-up."
      ]
    },
    {
      introducedIn: "2026.05.21.2",
      title: "Attack win chance loading no longer gets stuck",
      why: "The action menu now waits for fresh authoritative attack odds so outpost bonuses are accurate, but if the gateway preview response is stranded the menu could sit on 'Calculating win chance...' indefinitely.",
      changes: [
        "Fresh action-menu attack preview requests now have a watchdog that clears the loading state and re-renders the menu with a preview-unavailable message if the matching response does not arrive.",
        "A late matching gateway response can still replace the timeout message with the real win chance, so transient network delay no longer leaves the menu permanently stuck."
      ]
    },
    {
      introducedIn: "2026.05.21.1",
      title: "Town Production, gold cap, and connected-town count stop going stale",
      why: "The displayed Production, gold cap, and the 'N connected towns' modifier on an owned town tile each came from townJson fields persisted only when a full snapshot rebuild ran. Between rebuilds, the freshly recomputed connectedTownBonus updated but the goldPerMinute/cap it should have flowed into did not, so the same panel could show 'Production: 2.00/m', '+50% gold production', and 'Stored yield: 2112.0 / 960' simultaneously — the buffer was the only number actually tracking the real production rate. Separately, the connected-town count used a BFS that terminated on neighboring owned towns, so a third town reachable only via another owned town never counted toward the bonus even though the road overlay drew a road to it.",
      changes: [
        "Runtime tile delta and per-tile upkeep collection now refresh the town's goldPerMinute and gold cap from live support/fed/market/bank/connected-town state before serializing the townJson, so the Production row, gold cap, and Stored yield/cap ratio in the action menu can no longer disagree with the active modifiers list. The refresh only fires on towns that already carry a full snapshot shape, so it leaves test fixtures and partial-shape stubs untouched.",
        "Connected-town BFS now walks the owner's full settled-land 8-adjacency component instead of stopping at neighboring owned towns, matching the rule the client road overlay already uses to draw roads. Two towns sharing a settled-land blob now count as connected even when other owned towns sit on the path between them."
      ]
    },
    {
      introducedIn: "2026.05.20.7",
      title: "Attack previews wait for the real combat odds",
      why: "The action menu could cache or accept an older preview before the gateway returned fresh authoritative odds. That made nearby active outpost attack auras look like they were not changing the displayed win chance.",
      changes: [
        "Opening an enemy tile action menu now bypasses cached attack previews and shows a loading state while the gateway computes current odds.",
        "Attack preview requests carry a request id, and stale preview responses are ignored if a newer menu refresh is pending.",
        "Regression coverage verifies menu previews do not store unboosted local odds, supersede hover previews, and reject stale gateway responses."
      ]
    },
    {
      introducedIn: "2026.05.20.6",
      title: "Alliance breaks now give 24 hours of notice",
      why: "Diplomatic victory depends on alliance blocs, so leaving an alliance should not be an instant way to dodge a pending bloc win.",
      changes: [
        "Active ally cards now include a Break Alliance action; the old break-by-player-id form was removed.",
        "Breaking an alliance starts a 24 hour notice instead of removing the ally immediately, and the card shows the remaining notice time.",
        "The allied player gets an in-game alert when the break notice starts, and both players are notified when the alliance fully ends."
      ]
    },
    {
      introducedIn: "2026.05.20.5",
      title: "Desktop Choose Tier button is no longer a no-op",
      why: "Per-button onclick handlers were bound before the domains panel innerHTML was rewritten, so the new buttons the user actually saw had no listeners. Mobile worked because clicks were caught by the overlay container handler, which survived the rewrite.",
      changes: [
        "Domain panel now uses event delegation on the panel container (same pattern as the mobile overlay), so unlock and close clicks fire regardless of how often the inner HTML is re-rendered."
      ]
    },
    {
      introducedIn: "2026.05.20.4",
      title: "Ironworks and Aether Condenser unlock from their own techs",
      why: "The menu's hide-locked filter was checking Workshops for all three synthesizer-family buildings, so researching Alchemy or Crystal Lattices alone left Ironworks and Aether Condenser invisible in the build list even though the action itself was already enabled.",
      changes: [
        "build_ironworks now reports Alchemy as its required tech (matches the in-action gate).",
        "build_crystal_synthesizer now reports Crystal Lattices as its required tech.",
        "build_fur_synthesizer is unchanged — it still requires Workshops."
      ]
    },
    {
      introducedIn: "2026.05.20.3",
      title: "Strict FIFO development queue",
      why: "If you queued 20 settlements and then clicked a granary, the granary would sometimes start immediately by catching a slot that opened the instant a settlement finished, jumping ahead of the queue.",
      changes: [
        "Settle and build clicks now route to the end of the development queue whenever the queue is non-empty, regardless of available slots.",
        "Queue processor still drains in order, so behavior matches what you see in the queue UI."
      ]
    },
    {
      introducedIn: "2026.05.20.2",
      title: "Tier-1 domains reworked + dead tooltip effects brought to life + Clockwork Stipend goes live",
      why: "Most tier-1 modifiers were 10–20% — too small to feel decisive — and several effect keys (fortIronUpkeepMult, fortBuildGoldCostMult, fortDefenseMult, outpostSupplyUpkeepMult, outpostDeploymentSpeedMult, firstThreeTownsPopulationGrowthMult, attackVsSettledMult, attackVsFortsMult) only existed in tooltips; the sim never read them. Domains should feel like an identity choice from the first pick.",
      changes: [
        "Frontier Doctrine: settlement speed +50% (was +20%), keeps +1 development slot.",
        "Iron Bastions reworked: forts build +50% faster (new effect, now wired in the sim), and both fort iron upkeep and fort gold upkeep are -40%.",
        "Supply Raiding reworked: outpost deployment +50% faster and outpost supply upkeep -30%.",
        "Mercantile Charter: first-three-towns population growth bonus raised to +25% (was +15%) and now actually applies to the growth tick.",
        "Farmer's Compact retired; Clockwork Stipend takes its tier-1 slot — pick one resource (iron 0.2/min, supply 0.2/min, or crystal 0.1/min) for a permanent trickle. Choice is locked forever; an in-game modal lets you pick on confirm, the owned-domain card shows your locked pick after that. AI players pick whichever offered resource they are most stockpile-starved on.",
        "Frontier combat now reads defender-side fortDefenseMult and attacker-side attackVsSettledMult / attackVsFortsMult; the runtime extends FrontierCombatPreviewTile with a hasFort flag derived from the actual tile state.",
        "Single source of truth for the trickle resource list lives in @border-empires/shared (TRICKLE_RESOURCE_KEYS + isChosenTrickleResource guard); a parity test reads the raw domain-tree.json and fails loud on either-direction drift."
      ]
    },
    {
      introducedIn: "2026.05.20.1",
      title: "Barbarian population capped at 200",
      why: "Unchecked barb multiplication was the underlying cause of late-game gateway slowdowns. The cap holds the population steady without disabling regrowth.",
      changes: [
        "Barbarian-1 stops multiplying once it owns 200 tiles.",
        "An at-threshold walk on a capped population still walks (source releases, target captured) but carries the would-multiply progress to the target.",
        "As soon as any barb dies, the next walk from a progress-loaded barb tile multiplies — replacement happens immediately, no compound growth."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "Fort frontier control scales by tier",
      why: "Higher-tier forts should project a stronger border without making fresh staging frontier disappear before the player can act.",
      changes: [
        "Wooden forts project frontier control 1 tile, full forts 2 tiles, Iron Bastions 3 tiles, and Thunder Bastions 4 tiles.",
        "Newly claimed or captured frontier gets 20 seconds of protection from enemy fort patrol attacks.",
        "Launching an attack against a fort extends that staging protection by another 20 seconds.",
        "Queued or actively settling frontier no longer decays while it is waiting for settlement."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "Forts now patrol nearby enemy frontier",
      why: "A border fort should reduce the repetitive work of clearing small enemy frontier patches around it.",
      changes: [
        "Active forts now automatically attack adjacent enemy frontier tiles when the player has enough gold and manpower.",
        "Fort patrol attacks skip settled enemy tiles and fortified frontier tiles, so core assaults still require an intentional player attack.",
        "Fort patrol attacks use the normal frontier attack lock and resource costs."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "Unsupported frontier now decays",
      why: "Frontier should be quick to claim, but it should not leave permanent cleanup work when no fort is holding that border.",
      changes: [
        "Owned frontier tiles outside active fort support now start a 10 minute decay timer.",
        "Unsupported frontier returns to neutral when the timer expires, while resources, towns, and docks remain on the tile.",
        "Tiles in their final 60 seconds use a slow 2 second blink so the warning is visible without being noisy."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "Fort assaults require larger manpower commitments",
      why: "Fortified tiles should feel like real campaign objectives instead of ordinary attacks with a small extra manpower cost.",
      changes: [
        "Attacking an active fort now requires and commits 300 manpower.",
        "Attacking an Iron Bastion now requires and commits 600 manpower, and attacking a Thunder Bastion requires and commits 1200 manpower.",
        "Building a full fort now requires 300 manpower; starter wooden forts keep their lighter manpower footprint."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "Starter settlements no longer auto-claim frontier",
      why: "A fresh settlement should not spend gold expanding its surrounding frontier before the player has grown it into a real town.",
      changes: [
        "Settlement-tier towns no longer auto-claim adjacent unowned frontier tiles.",
        "Town-driven auto frontier expansion now starts only after the town grows beyond settlement tier.",
        "Fort auto frontier expansion and high-value auto-settlement behavior are unchanged."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "Settlement-tier towns no longer auto-settle support tiles",
      why: "A new settlement should not automatically commit its plain surrounding support tiles before the player has had time to grow it into a real town.",
      changes: [
        "Settlement-tier towns no longer put plain adjacent support tiles in the auto-settlement queue.",
        "Plain adjacent support tiles now wait until the nearby town grows beyond settlement tier before entering the auto-settlement queue.",
        "High-value frontier tiles with resources, towns, or docks still auto-queue regardless of nearby town tier."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "Sieges now respect manpower and outpost control",
      why: "Outpost automation should reduce repeated attack clicks without taking control away from the player, and fortified targets should demand a real manpower commitment.",
      changes: [
        "Active siege outposts now expose a menu action to cancel or re-enable their automatic attacks.",
        "Cancelling outpost auto-attack disables future attacks from that outpost and cancels its active outpost-launched attack lock.",
        "Building forts, siege outposts, wooden forts, and light outposts now spends manpower when construction starts.",
        "Attacks against active forts now require and commit more manpower based on fort strength, so failed fort assaults cause much heavier manpower losses."
      ]
    },
    {
      introducedIn: "2026.05.19.5",
      title: "High-value and town-support tiles auto-queue settlement",
      why: "Resources, towns, docks, and town-support tiles should enter the settle queue after you claim them instead of requiring another manual click, while still leaving players the existing cancel control.",
      changes: [
        "Owned frontier tiles with a resource, town, or dock now automatically enter the settlement queue when gold is available.",
        "Owned frontier tiles adjacent to one of your settled towns now also auto-queue as town-support tiles.",
        "Eligible auto-settlement tiles follow frontier expansion order instead of a special priority sort.",
        "Eligible frontier tiles waiting for a settlement slot now use the same numbered settlement queue badge as manually queued settlements.",
        "Cancel queued settlement now keeps a cancelled auto-settlement tile from immediately returning to the queue.",
        "Remote plain frontier tiles still stay frontier-only, so automation remains limited to valuable and support tiles."
      ]
    },
    {
      introducedIn: "2026.05.19.4",
      title: "3D meshes for Granary and Seed Granary",
      why: "Granaries had no 3D representation, so true-3D players saw the 2D SVG floating in place over the heightfield instead of an in-world structure. Seed Granary — the granary upgrade with stronger growth and lower food upkeep — needed a distinct silhouette so it would never get confused with the regular Granary or with the existing Farmstead's wooden silo.",
      changes: [
        "Granary now renders as a cream-walled wooden barn with a golden gable roof, three horizontal grain bands, a small grey-roofed side annex, a cupola/ventilator on top, and two grain sacks out front — colors and silhouette drawn from the granary-overlay.svg so 2D and 3D read as the same structure.",
        "Seed Granary now renders as a cluster of three tall stone silos with copper conical caps plus a small seed-lab annex with a green-glowing window, giving it a vertical, agronomy-lab silhouette that's clearly distinct from the squat wooden Granary barn and from the Farmstead's single silo. Seed Granary placement on tiles is not yet wired server-side, so the mesh currently shows only in the ?structuredemo=1 design row.",
        "Both meshes use instanced primitives consistent with the rest of the Tier-1 structure overlay (no new shader paths, no per-tile variants)."
      ]
    },
    {
      introducedIn: "2026.05.19.2",
      title: "Quieter, smoother waypoint expansion",
      why: "Initial waypoint release halted after one tile (the next top-up saw a stale neutral target before the ownership tile-delta arrived), and every step popped the full Capturing Territory overlay — so a four-tile chain stacked four pop-ups in a row on top of the existing waypoint visuals.",
      changes: [
        "topUpFromWaypoint tolerates up to four consecutive replans on the same step before halting, so a brief stale-snapshot window no longer aborts the chain. A 500ms heartbeat kicks processActionQueue while a waypoint is active so late ownership updates always get a fresh top-up.",
        "Waypoint-driven neutral expansions are now silent end-to-end: no Capturing Territory overlay, no Territory Claimed popup, no feed entry per tile. The target tile fills empire-color left to right at the standard frontier opacity (0.32) so the tile itself is the progress indicator.",
        "Errors, attack results on enemy tiles, and manual one-tap expands still surface every popup and feed entry exactly as before.",
        "Destination flag rebuilt as a steampunk tower: brass pedestal with two side cannons, copper rivet bands on the tower trunk, vertical empire-color banner with copper top stripe, winged gear medallion, brass dome and spire, glowing empire-color hex base, gently drifting smoke wisps, rotating gear rings."
      ]
    },
    {
      introducedIn: "2026.05.19.0",
      title: "Fort defense text matches the real bonus",
      why: "The tile menu's Modifiers section still said Fort: +25% defense even though active Forts defend at 2.5x, with stronger Iron and Thunder Bastion upgrades.",
      changes: [
        "Active Forts now show 2.5x defense in the tile Modifiers section.",
        "Iron Bastions and Thunder Bastions now show their own modifier names with 4x and 8x defense.",
        "The Fort structure detail panel now uses the same 2.5x local defense copy."
      ]
    },
    {
      introducedIn: "2026.05.18.10",
      title: "Captured towns explain their recovery smoke",
      why: "A town recently taken by another player could show black capture-shock smoke while the tile menu had no negative modifier, or could keep showing Long-term peace if that modifier was already present before the capture-shock payload was refreshed.",
      changes: [
        "Town capture shock now drives the tile heading's Recently captured countdown even when no captured structure is disabled.",
        "Settled captured towns now list a negative Recently captured modifier that calls out paused population growth while the shock window is active.",
        "Long-term peace and nearby-war growth rows are hidden while capture shock is active, and simulation snapshots recompute shocked town modifiers instead of preserving stale long-peace rows.",
        "Captured frontier towns still call out that town manpower and production are paused until the tile is settled."
      ]
    },
    {
      introducedIn: "2026.05.18.9",
      title: "Waypoint starts expanding the moment you confirm it",
      why: "Placing a waypoint set state.waypoint and hid the menu, but never called processActionQueue, so the first step did not enqueue until the player did some unrelated action that happened to poke the queue.",
      changes: [
        "Tile-action dispatch for Expand Here now calls processActionQueue() immediately after setting the waypoint, so the first step queues on the same frame.",
        "No change to halt or re-plan behaviour — only the kick that was missing."
      ]
    },
    {
      introducedIn: "2026.05.18.8",
      title: "Expansion waypoints: chain runs, menu sticks, flag looks alive",
      why: "Initial release of waypoints had three real bugs: the queue halted after one tile, the tile menu Cancel/Expand actions vanished on the first server tick, and the destination marker reused the same outline as the selection ring.",
      changes: [
        "Halt logic now checks whether the previously-enqueued tile is actually owned by you. A successful step always advances; a server reject (stale EXPAND_TARGET_OWNED, etc.) halts cleanly to amber instead of tight-looping.",
        "The Cancel Waypoint and Expand Here tile-menu actions are now reinjected by renderTileActionMenu itself, so the HUD's per-tick re-render no longer wipes them. Injection is idempotent so duplicates can't stack.",
        "The waypoint flag is now a brass-and-copper assembly: tapered pole with two copper rivet bands, horizontal cross-arm, empire-colored pennant with a copper top stripe, brass spire finial, and two counter-rotating cog rings around an empire-color glow disk at the base."
      ]
    },
    {
      introducedIn: "2026.05.18.7",
      title: "Production login restored after legacy host retirement",
      why: "The legacy `border-empires.fly.dev` server was retired and its DNS record stopped resolving, but the prod client's default still dialed that hostname whenever the Vercel build was missing VITE_GATEWAY_WS_URL — so every play.borderempires.com login completed Google sign-in and then hung on \"Securing session\" against a dead WebSocket.",
      changes: [
        "play.borderempires.com (and every other non-localhost, non-staging hostname) now defaults to the live combined gateway at wss://border-empires-combined.fly.dev/ws, with no reliance on a baked Vercel env var.",
        "The implicit env-default backend is now always the gateway; only an explicit ?backend=legacy URL param or be-backend=legacy cookie still selects the retired legacy stack, kept for forensic comparison.",
        "Added a regression test pinning play.borderempires.com to the prod gateway URL so a future env-var drift can't silently route prod into the dead legacy host again."
      ]
    },
    {
      introducedIn: "2026.05.18.6",
      title: "Season victory adds maritime and diplomatic wins",
      why: "The old land-control and continent-footprint paths overlapped with basic expansion and were harder to read than the strategic pressure players actually create through docks and alliances.",
      changes: [
        "Maritime Supremacy now starts a 24-hour victory hold when one empire controls 55% of world docks, with a minimum target of 3 settled docks.",
        "Diplomatic Dominance now starts a 24-hour victory hold when a player's alliance bloc controls 66% of claimable land and that player is the largest individual empire in the bloc.",
        "Territorial Control and Continental Footprint were removed from the active season-victory set, and AI path selection now treats diplomatic growth and maritime dock control as first-class strategies."
      ]
    },
    {
      introducedIn: "2026.05.18.5",
      title: "Low-FPS 3D warning works on desktop too",
      why: "The render FPS monitor could show desktop players stuck around 8-16 FPS, but the switch-to-2D prompt was still guarded by the old mobile-only check.",
      changes: [
        "Sustained 3D rendering at or below 25 FPS for 5 seconds now wakes the 2D switch prompt on desktop and mobile.",
        "The prompt still waits until the game HUD is initialized and stays hidden if you already dismissed it or are already using the 2D renderer.",
        "Added regression coverage for the prompt eligibility rules so the desktop path does not get gated out again."
      ]
    },
    {
      introducedIn: "2026.05.18.4",
      title: "Border anchors automate frontier work",
      why: "Expanding through enemy land and then settling every claimed tile created too much repetitive clicking after the strategic decision had already been made.",
      changes: [
        "Active forts now automatically frontier-claim unowned land in their surrounding 3x3 ring, spending the normal frontier-claim gold per tile.",
        "Settled towns now automatically frontier-claim adjacent unowned land, also paying the normal frontier-claim gold per tile.",
        "Settled towns automatically start settlement on adjacent owned frontier tiles only when those tiles contain a town, resource, or dock and gold/development slots are available.",
        "Active siege outposts now launch one adjacent attack per automation tick when their owner has enough gold and manpower, prioritizing weaker frontier targets."
      ]
    },
    {
      introducedIn: "2026.05.18.3",
      title: "Distant-tap expansion waypoints",
      why: "Tapping every tile in a long expansion chain is exhausting on mobile. Setting a destination once and letting the queue chip away matches how RTS games handle move orders.",
      changes: [
        "Tap any reachable land tile that you can't currently border to open the tile action menu. The new Expand Here action shows the total gold, manpower, and estimated time before you commit, then drops an empire-colored waypoint flag at the destination with the planned route lit up in the same color.",
        "The planner routes around mountains and through dock pairs and folds enemy tiles into the queue as attacks rather than stopping at borders.",
        "Once placed, the action queue chips away at the route one tile at a time and re-plans on every step, so fog reveals, ownership changes, and freshly captured tiles all feed back into routing.",
        "Tap the waypoint flag and choose Cancel Waypoint to clear it. Unreachable plans switch the flag to an amber halt tint so you notice and can re-target."
      ]
    },
    {
      introducedIn: "2026.05.18.2",
      title: "Zero-income empires regain a settlement",
      why: "In the rewrite economy, a real settlement always pays positive gross gold income. A recovered player with owned land but zero gross income has therefore lost the settlement invariant and should not remain alive with no settlement economy.",
      changes: [
        "Simulation startup now treats zero gross income as a settlement-recovery signal for non-barbarian players who still own territory.",
        "Live settlement capture now runs the same repair immediately when the defender's only remaining town is not a settlement.",
        "The repair respawns the player onto a fresh unowned settlement tile instead of overwriting any existing town they still control.",
        "Added simulation regressions for sparse startup recovery, zero-income recovery, and live settlement capture with stranded town territory."
      ]
    },
    {
      introducedIn: "2026.05.18.1",
      title: "Minimap zooms to your discovered region",
      why: "Drawing the full world made early-game exploration unreadable — your tiny known patch was a few pixels in the corner. The minimap had the data; it just wasn't framing it.",
      changes: [
        "The minimap view now computes a bounding box over the tiles you've discovered (visible or previously seen) with ~8 tiles of padding on each side.",
        "The box is expanded to match the minimap canvas aspect ratio so things don't stretch, then clamped to world bounds.",
        "As you discover new tiles the box expands, so the rendered area grows steadily instead of jumping.",
        "Minimap clicks and drags still set the camera correctly — pointer positions invert through the same view box.",
        "Camera viewport rect, player dot, town markers, dock pairs, replay overlays and shard pings all map through the new box, with off-frame markers culled."
      ]
    },
  ]
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const parseReleaseVersion = (releaseVersion: string): number[] =>
  releaseVersion
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));

export const compareReleaseVersions = (left: string, right: string): number => {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);
  const width = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < width; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
};

export const unseenClientChangelogEntries = (
  seenVersion: string,
  entries: ClientChangelogEntry[] = LATEST_CLIENT_CHANGELOG.entries
): ClientChangelogEntry[] => {
  if (!seenVersion) return entries;
  return entries.filter((entry) => compareReleaseVersions(entry.introducedIn, seenVersion) > 0);
};

export const shouldShowClientChangelog = (
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">,
  releaseVersion: string = LATEST_CLIENT_CHANGELOG.version
): boolean => state.authSessionReady && !state.profileSetupRequired && state.changelog.seenVersion !== releaseVersion;

export const syncClientChangelogVisibility = (
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">,
  releaseVersion: string = LATEST_CLIENT_CHANGELOG.version
): boolean => {
  state.changelog.open = shouldShowClientChangelog(state, releaseVersion);
  return state.changelog.open;
};

export const markClientChangelogSeen = (
  state: Pick<ClientState, "changelog">,
  releaseVersion: string = LATEST_CLIENT_CHANGELOG.version,
  persistSeenVersion: typeof storageSet
): void => {
  state.changelog.open = false;
  state.changelog.seenVersion = releaseVersion;
  state.changelog.scrollTop = 0;
  persistSeenVersion(CLIENT_CHANGELOG_STORAGE_KEY, releaseVersion);
};

const changelogBodyHtml = (entries: ClientChangelogEntry[]): string =>
  entries
    .map(
      (entry) => `
        <article class="changelog-entry">
          <div class="changelog-entry-version">Release ${escapeHtml(entry.introducedIn)}</div>
          <h3 class="changelog-entry-title">${escapeHtml(entry.title)}</h3>
          <div class="changelog-section">
            <span class="changelog-section-label">Why</span>
            <p class="changelog-section-copy">${escapeHtml(entry.why)}</p>
          </div>
          <div class="changelog-section">
            <span class="changelog-section-label">Changed</span>
            <ul class="changelog-list">
              ${entry.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}
            </ul>
          </div>
        </article>
      `
    )
    .join("");

export const clientChangelogRenderSignature = (releaseVersion: string, buildVersion: string): string =>
  `${releaseVersion}:${buildVersion}`;

export const shouldRebuildClientChangelogOverlay = (
  overlayEl: Pick<HTMLDivElement, "innerHTML" | "dataset">,
  renderSignature: string
): boolean => overlayEl.innerHTML === "" || overlayEl.dataset.renderSig !== renderSignature;

export const renderClientChangelogOverlay = (deps: {
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "changelog">;
  changelogOverlayEl: HTMLDivElement;
  buildVersion: string;
  persistSeenVersion: typeof storageSet;
  renderHud: () => void;
}): void => {
  const releaseVersion = LATEST_CLIENT_CHANGELOG.version;
  const renderSignature = clientChangelogRenderSignature(releaseVersion, deps.buildVersion);
  const unseenEntries = unseenClientChangelogEntries(deps.state.changelog.seenVersion);
  const summary =
    unseenEntries.length === LATEST_CLIENT_CHANGELOG.entries.length
      ? LATEST_CLIENT_CHANGELOG.summary
      : unseenEntries.length === 1
        ? "This popup now shows only the single release-note entry you have not seen yet."
        : `This popup now shows the ${unseenEntries.length} release-note entries you have not seen yet.`;
  const isOpen = syncClientChangelogVisibility(deps.state, releaseVersion);
  deps.changelogOverlayEl.style.display = isOpen ? "grid" : "none";
  if (!isOpen) {
    if (deps.changelogOverlayEl.innerHTML) deps.changelogOverlayEl.innerHTML = "";
    delete deps.changelogOverlayEl.dataset.renderSig;
    return;
  }

  if (shouldRebuildClientChangelogOverlay(deps.changelogOverlayEl, renderSignature)) {
    deps.changelogOverlayEl.innerHTML = `
      <div class="changelog-backdrop" id="changelog-backdrop"></div>
      <div class="changelog-modal card" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
        <div class="changelog-topbar">
          <div class="changelog-topbar-copy">
            <div class="changelog-kicker">Release ${escapeHtml(releaseVersion)} • Build ${escapeHtml(deps.buildVersion)}</div>
            <span class="changelog-unseen-count">${unseenEntries.length} new ${unseenEntries.length === 1 ? "entry" : "entries"}</span>
          </div>
          <button id="changelog-close" class="panel-btn changelog-primary-btn" type="button">Continue</button>
        </div>
        <div class="changelog-modal-scroll">
          <h2 id="changelog-title" class="changelog-title">${escapeHtml(LATEST_CLIENT_CHANGELOG.title)}</h2>
          <p class="changelog-summary">${escapeHtml(summary)}</p>
          <div class="changelog-entry-list">
            ${changelogBodyHtml(unseenEntries)}
          </div>
        </div>
      </div>
    `;
    deps.changelogOverlayEl.dataset.renderSig = renderSignature;
  }

  const scrollEl = deps.changelogOverlayEl.querySelector(CLIENT_CHANGELOG_SCROLL_SELECTOR) as HTMLDivElement | null;
  if (scrollEl) {
    if (Math.abs(scrollEl.scrollTop - deps.state.changelog.scrollTop) > 1) {
      scrollEl.scrollTop = deps.state.changelog.scrollTop;
    }
    scrollEl.onscroll = () => {
      deps.state.changelog.scrollTop = scrollEl.scrollTop;
    };
  }

  const close = (): void => {
    markClientChangelogSeen(deps.state, releaseVersion, deps.persistSeenVersion);
    deps.renderHud();
  };

  const closeBtn = deps.changelogOverlayEl.querySelector("#changelog-close") as HTMLButtonElement | null;
  const backdropBtn = deps.changelogOverlayEl.querySelector("#changelog-backdrop") as HTMLDivElement | null;
  if (closeBtn) closeBtn.onclick = close;
  if (backdropBtn) backdropBtn.onclick = close;
};
