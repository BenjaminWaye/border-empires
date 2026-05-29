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
  version: "2026.05.29.2",
  title: "What's New",
  summary: "Fort and siege tiers now persist server-side. Shard rain now pings on the minimap, and duplicate-shard prevention.",
  entries: [
    {
      introducedIn: "2026.05.29.2",
      title: "Fort and siege outpost tiers persist — Iron/Thunder Bastion defense and Siege/Dread Tower attack work correctly",
      why: "Fort and siege variants existed only as client-side optimistic labels. The simulation never stored a structure's tier, so combat multipliers defaulted to base values (5x for all forts, 1.6x for all siege). Upgrade menus offered bogus actions on maxed structures, and menu text showed wrong defense/attack numbers. Displayed siege attack multipliers are also corrected — they now match the authoritative config values.",
      changes: [
        "Forts: BUILD_FORT creates the best available tier and upgrades follow FORT → Iron Bastion → Thunder Bastion. Costs: Iron 1800g/90 iron, Thunder 4200g/180 iron.",
        "Siege: BUILD_SIEGE_OUTPOST creates the best available tier and upgrades follow Siege Outpost → Siege Tower → Dread Tower. Costs: Tower 1800g/90 SUPPLY/60 IRON, Dread 4200g/140 SUPPLY/120 IRON.",
        "Attack multiplier labels on Siege Tower (was 2x, now 1.8x) and Dread Tower (was 3x, now 2.0x) corrected — no behavior change, just accurate labels.",
        "buildDetailTextForAction now shows correct tier-based defense and attack numbers."
      ]
    },
    {
      introducedIn: "2026.05.29.2",
      title: "Shard rain now pings on the minimap when it starts",
      why: "Shard rain sites appeared on the map but never triggered minimap location pings, so players had to scan the entire map to find them. The server was broadcasting site coordinates but only to system-internal subscribers — clients never received them.",
      changes: [
        "Shard rain start broadcasts now include the x/y of each placed site alongside the site count.",
        "Client registers minimap pings for each site immediately when the shard rain alert arrives, using the same staged fall-delay timing as tile-delta-based pings.",
        "Reconnecting players also get pings from the init-payload shard rain notice."
      ]
    },
    {
      introducedIn: "2026.05.29.2",
      title: "Shard rain no longer places sites on tiles used in the previous rain event",
      why: "When the valid land tile pool is small (e.g. late-game with many claimed tiles), the random placement could land on the exact same tile multiple events in a row, making it look like a stale duplicate.",
      changes: [
        "Shard rain now tracks recently-placed tile keys and excludes them from candidate selection during the same event.",
        "The exclusion set is cleared at the start of each new rain event."
      ]
    },
    {
      introducedIn: "2026.05.29.2",
      title: "CACHE shard collections now survive process restarts",
      why: "One-time CACHE shards could reappear after a simulation process restart because the cleared state wasn't durably checkpointed before the process exited. FALL shards were immune because they expire naturally on the next tick.",
      changes: [
        "Collecting a non-FALL (CACHE) shard now requests an immediate checkpoint write, making the cleared state durable before the next process restart."
      ]
    },
    {
      introducedIn: "2026.05.29.1",
      title: "Upkeep shown on every building action",
      why: "The buildings tab showed build cost and time but omitted the ongoing upkeep, so players had no way to see what a building would cost per minute before committing.",
      changes: [
        "All buildings with gold, food, or crystal upkeep now display it in the action menu detail line (e.g. '0.1 gold/min', '0.05 food/min').",
        "Corrected the Fur Synthesizer, Ironworks, and Aether Condenser upkeep display from 12/12/16 gold/min to the correct 6/6/8 gold/min.",
        "Corrected Harbor Exchange (Customs House) upkeep from 0.5 to 1.5 gold/min.",
        "Removed phantom '1.5 gold/min' from Caravanary — the sim charges food upkeep only.",
        "Standardised all upkeep labels to the 'X gold/min' / 'X food/min' format throughout.",
      ],
    {
      introducedIn: "2026.05.28.3",
      title: "Manpower regen slowed; rate shows a decimal",
      why: "Manpower filled in ~15-20 minutes, which made the game largely about who could stay online longest to bank attacks. Regen is now tuned so a settlement takes ~12 hours to fill its cap, making manpower a strategic resource rather than a faucet. Because per-minute regen is now well under 1 for small empires, the HUD rate chip rounded it to '+0/m' and looked broken.",
      changes: [
        "Manpower regeneration is roughly 48x slower across all population tiers (a settlement now takes ~12 hours to refill its cap). Caps are unchanged.",
        "The manpower rate chip now shows one decimal place (e.g. '+0.2/m') so slow regen is visible instead of rounding to '+0/m'."
      ]
    },
    {
      introducedIn: "2026.05.28.2",
      title: "Tile overview warns about unsupported frontier decay immediately",
      why: "The tile overview header only showed a countdown in the final 60 seconds of a frontier tile's natural 10-minute decay window. Players who checked a freshly claimed frontier tile saw no indication it was decaying until the last minute.",
      changes: [
        "Tile overview now shows 'This tile is unsupported and will soon decay.' for the full decay window, not just the final 60 seconds."
      ]
    },
    {
      introducedIn: "2026.05.28.1",
      title: "Waypoint paths run straight instead of zigzagging",
      why: "The waypoint planner picked any shortest path, so among equal-length routes it could weave (N-E-N-E) or overshoot before doubling back, even when a clean straight or diagonal line reached the target.",
      changes: [
        "Waypoint routing now adds a tiny per-turn tiebreaker so equal-length paths prefer the fewest direction changes: a target due in one direction expands in a straight line, a pure-diagonal target expands diagonally, and mixed targets keep their straight runs grouped (and connected) rather than zigzagging."
      ]
    },
    {
      introducedIn: "2026.05.27.2",
      title: "Capture pop-loss indicator now readable through smoke",
      why: "The floating \"-N pop\" label spawned inside the captured-town smoke column at a small size with a heavy black outline, so the red fill was largely covered and the text read as white at a glance. It also barely moved, making it easy to miss next to the dramatic smoke effect.",
      changes: [
        "Label is larger (3.2x sprite scale, 96px bold canvas font) with a soft shadow instead of a chunky outline, so the red fill dominates and the text reads at a glance.",
        "Color saturated to #ff2d2d so it reads as red, not washed-out coral.",
        "Now rises ~4.2 world units over 3.2s with an ease-out curve and a brief pop-in scale, so it clearly floats away above the smoke instead of sitting inside it.",
        "renderOrder bumped to 9999 so the label always paints over the smoke puffs."
      ]
    },
    {
      introducedIn: "2026.05.27.1",
      title: "Settle a whole frontier pocket in one tap",
      why: "Settling each tile of a freshly captured pocket one click at a time was tedious; the new 'Settle Connected (N)' action in the tile menu queues every connected frontier tile you own.",
      changes: [
        "Frontier tile menu now shows 'Settle Connected (N)' when 2+ of your frontier tiles are connected.",
        "Each tile still costs the standard settle gold and uses a development slot — extras are queued FIFO like manual settles."
      ]
    },
    {
      introducedIn: "2026.05.26.5",
      title: "Tile menu shows a countdown for natural frontier decay",
      why: "The 3D map already blinks frontier tiles white in the last 60s of their ~10-minute natural decay window, but the tile menu header only surfaced a timer for encirclement (cut-off) decay. Players who clicked a blinking tile to see how long they had left got no number.",
      changes: [
        "Tile menu header now shows 'Frontier collapsing in Ns' for the final 60s of natural frontier decay, mirroring the existing encirclement 'Cut off from supply' countdown."
      ]
    },
    {
      introducedIn: "2026.05.26.4",
      title: "3D buildings no longer double up with 2D sprites",
      why: "The 3D structure overlay now renders ~28 building kinds (economic + late-game + civic + infrastructure + industrial), but the 2D fallback in client-runtime-loop.ts only suppressed a hardcoded 7-type Tier-1 list. Every newer building (Bank, Caravanary, Foundry, Airport, etc.) was being drawn twice — 3D mesh plus 2D PNG/marker on top.",
      changes: [
        "Both 2D structure-draw passes now consult STRUCTURE_KINDS_HANDLED_BY_3D (the authoritative set from client-map-3d-structure-overlay.ts) instead of a stale hardcoded Tier-1 allowlist, so any kind the 3D overlay can render hides its 2D fallback automatically as new families are added."
      ]
    },
    {
      introducedIn: "2026.05.26.3",
      title: "Light Outpost sweep toggle now works",
      why: "The sim already ticked Light Outpost sweep budget every tick AND the SET_SIEGE_OUTPOST_SWEEP handler already accepted LIGHT_OUTPOST tiles (since PR #390) — but the Start/Stop Sweep tile action only rendered for tile.siegeOutpost. Because LIGHT_OUTPOST lives on tile.economicStructure the toggle never appeared, leaving sweepActive permanently false.",
      changes: [
        "Start/Stop Sweep action now appears on owned, active Light Outposts in the tile action panel.",
        "Client-only fix — no sim or wire changes. The semantic mismatch (message named SET_SIEGE_OUTPOST_SWEEP also flips Light Outposts) is acknowledged debt for the planned structure-pipeline rewrite.",
        "No game balance changes."
      ]
    },
    {
      introducedIn: "2026.05.26.2",
      title: "Tile inspector shows real town production again",
      why: "REQUEST_TILE_DETAIL returned a townJson with baseGoldPerMinute=2 but no goldPerMinute, and yieldRate.goldPerMinute=0. Root cause: the gateway-cached tile-detail path (buildSnapshotTileDetail) forwarded the snapshot's missing goldPerMinute through to buildTileYieldView, which — called without an economyContext — returns 0 for TOWN-tier tiles whose town.goldPerMinute isn't set. Compounding it, the client sent a fresh REQUEST_TILE_DETAIL on every click of the same tile even when the previous request was still in flight, piling up duplicate work on a backed-up gateway.",
      changes: [
        "buildSnapshotTileDetail now backfills goldPerMinute and cap inline using the same formula as the live snapshot when the snapshot tile's townJson lacks them, so owned-town inspectors show the real Production value (e.g. 4.4/m on a TOWN with +120% connected-town bonus) instead of 0.",
        "refreshTownEconomyFields re-stamps isFed from the freshly computed fed-key set, so the wire payload's townJson.isFed can no longer contradict the live goldPerMinute it ships alongside.",
        "Tile-detail requests are deduped by tile: a click is suppressed if a full-detail response landed within the last 60s, or if a request for the same tile is still in flight (15s timeout protects against dropped responses)."
      ]
    },
    {
      introducedIn: "2026.05.26.1",
      title: "Frontier decay no longer blocks supplied expansion",
      why: "The simulation uses the same frontierDecayAt field for natural 10-minute frontier expiry and 60-second encirclement decay. Action validation treated any timer as cut off, so supplied frontier tiles with normal decay could incorrectly reject expand, attack, or settle commands with ORIGIN_CUT_OFF.",
      changes: [
        "Simulation now checks actual 8-neighbor supply connectivity before rejecting frontier origins or settlements as cut off.",
        "Connected frontier tiles with natural decay timers can expand, attack, and settle normally; genuinely disconnected frontier tiles remain blocked."
      ]
    },
    {
      introducedIn: "2026.05.25.1",
      title: "Collect no longer floods live tile updates",
      why: "Production telemetry showed COLLECT_VISIBLE spending over a second applying tile-delta fanout after large empires gathered stored yield. The command was clearing each tile individually, then broadcasting and filtering thousands of zero-yield tile deltas even though collection is a player-level economy action.",
      changes: [
        "Visible collect now advances a player collection epoch and emits the collect result/player update without sending a giant TILE_DELTA_BATCH.",
        "Snapshots and tile detail use that player epoch when deriving stored yield, so collected tiles still show cleared yield after reconnects or restarts."
      ]
    },
    {
      introducedIn: "2026.05.24.5",
      title: "Expansion accepts more reliably under AI load",
      why: "AI and system automation jobs could drain from the simulation queue in the microtask phase immediately after being submitted. That preserved lane priority for already-queued human commands, but it still let background jobs start too aggressively between socket events and delay a later human expansion until the client showed the 2s sync warning.",
      changes: [
        "Human and gateway commands still schedule immediate runtime drains, while ai-runtime and system-runtime automation jobs now yield to the event loop before draining.",
        "The load harness now keeps successful latency samples when a soak stops because the test player runs out of manpower, so nightly gates evaluate real accept timings instead of failing with null samples."
      ]
    },
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
