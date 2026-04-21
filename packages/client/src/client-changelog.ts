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
  version: "2026.04.21.7",
  title: "What's New",
  summary: "Recent updates include frontier desync hardening on both client and simulation server paths to prevent false NOT_OWNER origin races, plus login-screen backend routing diagnostics and staging gateway-default hardening.",
  entries: [
    {
      introducedIn: "2026.04.21.7",
      title: "Simulation now recovers stale frontier origin payloads server-side",
      why: "Fast chained actions could send an outdated from-tile while the player still had a valid adjacent owned origin, causing avoidable NOT_OWNER rejects despite a legal move existing.",
      changes: [
        "Rewrite simulation now re-selects a valid owned adjacent origin for frontier commands when the submitted origin is stale, instead of failing immediately with NOT_OWNER.",
        "Added runtime regression coverage to assert stale-origin expand payloads are accepted and resolved via the server-selected authoritative origin."
      ]
    },
    {
      introducedIn: "2026.04.21.6",
      title: "Frontier queue now waits for confirmed origin ownership before sending follow-up expands or attacks",
      why: "Fast chained actions could select an optimistic frontier tile as the next origin before the server had confirmed ownership, leading to intermittent NOT_OWNER errors even though the tile looked owned client-side.",
      changes: [
        "Queue dispatch now requires a confirmed origin tile and defers the action briefly when only optimistic ownership is available.",
        "Added regression coverage for both expand and attack queue paths so optimistic-only origins are held instead of being sent and rejected."
      ]
    },
    {
      introducedIn: "2026.04.21.5",
      title: "Successful expands no longer stay stuck as queued when tile deltas arrive out of order",
      why: "A race where TILE_DELTA arrived before ACTION_ACCEPTED/FRONTIER_RESULT could leave the queued marker and purple border stuck even though the server had already confirmed a successful expand.",
      changes: [
        "Client frontier state now resolves successful EXPAND actions directly on FRONTIER_RESULT for the active command instead of waiting exclusively for a later tile-delta ownership update.",
        "Added regression coverage for the missing-follow-up-delta path so successful expands still clear actionInFlight/actionTarget/queuedTargetKeys and resume queued work."
      ]
    },
    {
      introducedIn: "2026.04.21.4",
      title: "Login screen now shows live backend and Fly route diagnostics",
      why: "Staging and preview URLs can route to different server stacks, and it was hard to tell whether a client session was about to hit legacy or rewrite before sign-in finished.",
      changes: [
        "Added a login-screen debug line that displays active backend mode, resolved websocket URL, and parsed Fly app hostname target.",
        "Diagnostics refresh with auth overlay state updates so you can verify routing on reconnect and bootstrap retries."
      ]
    },
    {
      introducedIn: "2026.04.21.3",
      title: "Staging client hostname now defaults to rewrite gateway",
      why: "The staging Vercel alias could still boot into the legacy backend by default, which made staging validation inconsistent unless you manually appended query params or set a backend cookie first.",
      changes: [
        "Backend env-default selection now treats staging Vercel hostnames as gateway-default instead of legacy-default.",
        "Staging hostname routing now ignores stale be-backend cookies, so old legacy-cookie state can no longer force staging back onto the legacy server.",
        "Added selector regression coverage so staging alias hosts keep routing to the rewrite gateway unless explicitly overridden by URL param."
      ]
    },
    {
      introducedIn: "2026.04.21.1",
      title: "Frontier queue diagnostics for stuck queued expands",
      why: "A new regression could leave a queued frontier badge and border highlight visible after an expand had already resolved, but the client did not expose enough state-transition detail to quickly identify which message or clear path failed.",
      changes: [
        "Added explicit frontier queue debug logs for COMMAND_QUEUED, ACTION_ACCEPTED, COMBAT_START, FRONTIER_RESULT, COMBAT_RESULT, TILE_DELTA_BATCH, TILE_DELTA, and ERROR handling.",
        "Added logs around queue-clear and resolve decisions so you can see when a tile-delta path should clear actionTarget, queuedTargetKeys, and optimistic expand state."
      ]
    },
    {
      introducedIn: "2026.04.20.2",
      title: "Rewrite debug badge now shows live accept-latency p95",
      why: "Phase-5 rewrite observability requires the client to expose active backend health signals, but the badge only showed backend identity and bootstrap metadata, so you could not directly see live command-accept latency pressure while testing.",
      changes: [
        "The rewrite world-status stream now includes accept-latency p95 from simulation command-accept metrics.",
        "Client bridge debug state now tracks that accept-latency p95 value and renders it in the backend debug badge.",
        "Copied debug payloads now include the accept-latency p95 line so parity and load investigations can include the same live value."
      ]
    },
    {
      introducedIn: "2026.04.20.1",
      title: "Fallback attack preview now matches shared combat math",
      why: "When websocket attack-preview responses were still in flight, the client fallback estimate used a local formula that could diverge from authoritative combat resolution odds, which made some hostile frontier tiles look like guaranteed captures even when they were not.",
      changes: [
        "Client-side fallback attack preview now calls the same shared frontier combat module used by the gateway and simulation.",
        "Fallback win chance, breakthrough win chance, and displayed defense efficiency now stay aligned with authoritative combat calculation instead of a client-only formula."
      ]
    },
    {
      introducedIn: "2026.04.19.3",
      title: "Building cards now queue correctly when development slots are full",
      why: "The rewrite client already knew how to queue structure builds behind busy development slots, but the tile menu could still blame full slots even when the real blocker was something else like missing gold. That made build availability look inconsistent and hid when a build should simply queue.",
      changes: [
        "Otherwise-valid building actions now stay enabled and show queued cost text when every development slot is busy, matching the existing queued-build behavior.",
        "When a building is blocked for a real reason such as insufficient gold, the menu now keeps that blocker text instead of replacing it with a misleading no-slots message.",
        "Client regression coverage now locks this behavior down so queued builds and blocker messaging do not drift apart again."
      ]
    },
    {
      introducedIn: "2026.04.19.2",
      title: "Rewrite restarts now recover player balances, pending settlement timers, and tile yield buffers from snapshot state",
      why: "The split simulation could already recover tiles and command history from Postgres, but several runtime-owned details like player balances, in-flight settlement timers, and stored collect buffers were still being rebuilt from seed/bootstrap defaults after restart. That made real season state look like it drifted even when the durable world itself had been recovered.",
      changes: [
        "Simulation snapshots now persist recovered player runtime state instead of only tiles and combat locks, so gold, manpower, tech/domain unlocks, alliances, and resource balances survive checkpointed restart recovery.",
        "Pending settlement work and collected-yield timestamps are now restored from snapshot state, so restart no longer silently drops in-flight settle timers or resets stored collection buffers back to zero.",
        "Collect-visible cooldown state is also carried through recovery so the authoritative runtime after restart matches the pre-restart gameplay state much more closely."
      ]
    },
    {
      introducedIn: "2026.04.19.1",
      title: "Rewrite simulation now fails closed when durability breaks instead of serving drifting world state",
      why: "The playtest simulation could continue accepting and applying gameplay in memory during Postgres timeout periods even after persistence had already failed. When that unhealthy process later restarted, players came back to the last durable snapshot/event state instead of the last seen state, which could make yesterday's settled tiles or captured towns appear to revert.",
      changes: [
        "Simulation persistence failures now trip a fatal mode callback instead of only marking the persistence queue degraded and continuing to run gameplay on undurable state.",
        "Once persistence is degraded or has already failed, the simulation stops accepting new commands rather than continuing to mutate the world in memory.",
        "This makes persistence outages surface as a hard server outage instead of silently allowing season-state drift that only becomes visible after a restart."
      ]
    },
    {
      introducedIn: "2026.04.18.11",
      title: "Rewrite bootstrap now rejects unavailable simulation cleanly and backs off heavy status broadcasts",
      why: "When the simulation got unhealthy, control and bulk auth could race each other and still leak a half-finished bootstrap path into the client, leaving a confusing mix of SERVER_STARTING errors, INIT payloads, and map sync stall states. At the same time, the simulation was still rebuilding global leaderboard and season-victory status far too aggressively on large AI worlds.",
      changes: [
        "Gateway player subscriptions now dedupe in-flight subscribe calls for the same player, so control and bulk websocket auth no longer race each other into mismatched bootstrap state.",
        "Gateway auth now rejects immediately with a retryable simulation-unavailable error when the live simulation health check is already red, instead of attempting a partial bootstrap anyway.",
        "Simulation runtime configuration now supports a dedicated global-status broadcast debounce, and the Fly playtest simulation now uses a much slower status-broadcast cadence to reduce large-world event-loop stalls."
      ]
    },
    {
      introducedIn: "2026.04.18.10",
      title: "Rewrite refresh now resets frontier queue state instead of reviving stale in-flight actions",
      why: "Frontier reconnect recovery kept trying to hydrate previously accepted attack and expand commands after refresh, which could bring back ghost queue markers and half-stale in-flight state even when the safest behavior was to let the player come back clean.",
      changes: [
        "Gateway INIT recovery now keeps the client-sequence cursor but no longer asks the client to restore pending frontier attack or expand actions after refresh.",
        "Refresh and reconnect now reset frontier queue state instead of resurrecting accepted frontier commands that may already be stale on the authoritative server."
      ]
    },
    {
      introducedIn: "2026.04.18.9",
      title: "Rewrite bootstrap no longer pretends stalled map sync is just chunk loading forever",
      why: "The client could already surface retryable simulation outages like SERVER_STARTING, but if the gateway still managed to send INIT before chunk data arrived, the map overlay could fall back to generic 'Loading nearby land...' copy and count upward forever even though the session had clearly stalled.",
      changes: [
        "Initialized rewrite sessions that still have zero received chunks after a short grace period now switch from generic chunk-loading copy to a retryable 'Map sync stalled' warning state.",
        "That stalled warning state exposes Retry now and Reload actions, so a half-initialized session no longer looks like healthy chunk loading when the backend has actually stopped delivering nearby land."
      ]
    },
    {
      introducedIn: "2026.04.18.8",
      title: "Rewrite outage overlay now shows simulation-unavailable errors instead of fake chunk loading",
      why: "When the gateway reported SERVER_STARTING or other retryable bootstrap failures, the client could still keep the map-loading card in a generic 'Loading nearby land...' state with a ticking timer. That made a real server outage look like slow chunking instead of telling the truth about the backend state.",
      changes: [
        "The map-loading overlay now uses the retryable auth/bootstrap state instead of generic chunk-loading copy when the realtime simulation is unavailable.",
        "Retryable bootstrap outages now show explicit Retry now and Reload actions in the loading overlay, so you can recover without guessing whether the spinner is meaningful.",
        "Healthy bootstrap still keeps the normal nearby-land loading copy and chunk counter; only real retryable outages switch to the warning state."
      ]
    },
    {
      introducedIn: "2026.04.18.7",
      title: "Rewrite tile detail no longer blanks settlement production and storage after opening overview",
      why: "The main rewrite tile sync was already carrying per-tile yield data, but owned tile detail requests could still rebuild a thinner detail payload from the gateway snapshot. That made the overview regress back to `Production: 0.00/m` and hide stored-yield capacity even when the same settlement was actually producing gold and the collect path worked.",
      changes: [
        "Gateway tile-detail responses now preserve existing stored yield, yield rate, and yield cap when the snapshot already has them.",
        "When a rewrite snapshot tile is still thin, owned settled tile detail now backfills yield-rate and yield-cap metadata from authoritative settlement, dock, and structure state instead of dropping to blank production values.",
        "Opening the overview on a producing settlement now keeps the same production/storage metadata the rest of the rewrite runtime is using."
      ]
    },
    {
      introducedIn: "2026.04.18.6",
      title: "Rewrite collect, stored yield, and tile production views now stay in sync",
      why: "The rewrite simulation had started deriving tile yield buffers, but the gateway/client bridge was still dropping yield fields during init and tile updates, and collect actions were not emitting a fresh player economy update. That left settlements claiming 1 gold per minute while their production line showed 0, hid stored gold on the tile, and made collect look like it awarded nothing until some unrelated later refresh.",
      changes: [
        "Gateway tile sync now preserves per-tile stored yield, yield rate, and yield cap fields on bootstrap, tile deltas, and tile detail updates instead of silently dropping them.",
        "Collect actions now emit an immediate player update after gold or resources are gathered, so the toolbar reserve updates as soon as you collect instead of waiting for a later sync.",
        "Settlement and resource tile overviews now show the same live production and stored-yield state that the rewrite simulation is actually using."
      ]
    },
    {
      introducedIn: "2026.04.18.5",
      title: "Rewrite AI frontier growth now favors strategic targets instead of settling every coastal strip",
      why: "The rewrite AI loop had drifted far away from legacy: it would auto-settle almost any frontier tile whenever a development slot was free, while frontier expansion still chose the first adjacent land tile in sort order. That produced coastal strip empires with zero frontier, missed nearby towns and resources, and could still leak the raw seeded player id in status views.",
      changes: [
        "Rewrite AI automation now only auto-settles frontier tiles with real strategic value such as towns, docks, resource tiles, or town-support opportunities, instead of blindly settling generic empty frontier land.",
        "Rewrite frontier planning now scores adjacent attack and expand targets, so AI prefers towns, docks, resources, and more connected inland land over plain coastal filler chosen purely by tile sort order.",
        "World-status fallback naming now renders the seeded human slot as Nauticus instead of leaking the raw player-1 id when no profile override has been applied yet."
      ]
    },
    {
      introducedIn: "2026.04.18.4",
      title: "Rewrite frontier costs, queue recovery, and live player state now stay in sync during play",
      why: "Rewrite frontier claims could still resolve without ever deducting their gold cost, queued frontier actions could stall behind an expired optimistic origin, season-victory town totals were undercounting neutral towns, and player updates could leave the HUD and economy panel out of sync until the next reconnect or refresh.",
      changes: [
        "Neutral frontier claims now actually deduct the shared 1-gold frontier cost when they resolve, and breakthrough attacks use the real shared gold and iron costs instead of the old rewrite-only placeholders.",
        "The frontier queue now falls through to the optimistic origin for the first queued neutral expand instead of freezing the entire queue behind an origin that just timed out locally.",
        "Live PLAYER_UPDATE payloads now carry fresh economy breakdown, upkeep totals, and T/E defensibility metrics, so the toolbar, economy panel, and defensibility readout stay aligned without waiting for a full INIT refresh.",
        "Town-control victory pressure now counts all towns in the world rather than only already-owned competitive towns, and seed-profile players are prompted to finish name/color setup instead of silently inheriting the seed default forever.",
        "AI settlement automation now values town tiles, docks, food, and nearby town-support openings ahead of generic empty frontier land, so early growth paths prioritize actual economy."
      ]
    },
    {
      introducedIn: "2026.04.18.3",
      title: "Rewrite AI frontier costs and settlement pacing now match shared gameplay rules much more closely",
      why: "The split rewrite simulation was still validating ordinary frontier claims at a hardcoded cost far above the shared game config, which left AIs stuck at low income and low settled-tile counts while they spammed unaffordable frontier commands instead of growing naturally.",
      changes: [
        "Rewrite frontier validation now uses the shared frontier-claim gold cost instead of a rewrite-only inflated value, so ordinary expansion no longer drains AI progress at the wrong rate.",
        "AI automation now skips frontier actions it cannot currently afford instead of hammering the simulation with repeated insufficient-gold or insufficient-manpower rejects.",
        "AI settlement automation can now keep filling available development slots instead of waiting for every pending settlement to finish before starting the next one."
      ]
    },
    {
      introducedIn: "2026.04.18.2",
      title: "DB-backed rewrite playtests no longer silently seed a fresh world after failed recovery",
      why: "The Fly rewrite playtest could previously time out or crash during startup recovery and then fall back to a brand-new seeded world, which made a long-running approval soak impossible because the world could effectively reset itself after an outage.",
      changes: [
        "DB-backed rewrite simulation startup now treats failed recovery as a real startup failure instead of silently falling back to a fresh seed world.",
        "The Fly simulation playtest config now checkpoints far more frequently and uses a tighter heap cap on the 512 MB machine, so restarts are more likely to recover from recent snapshots instead of replaying the entire world history."
      ]
    },
    {
      introducedIn: "2026.04.18.1",
      title: "Rewrite town detail and economy panels now use live server-side snapshot data instead of thin bridge placeholders",
      why: "The rewrite stack was still emitting a thinner per-player snapshot than legacy, which meant town detail could lose support counts, modifier context, and upkeep sections, while the economy panel on seed-backed rewrite worlds could show totals without the matching live income and sink breakdowns.",
      changes: [
        "Rewrite simulation player snapshots now derive live economy breakdowns, upkeep totals, and food coverage from the authoritative runtime instead of falling back to empty bootstrap placeholders on fresh playtest worlds.",
        "Rewrite snapshot town summaries now include support counts, fed state, market/granary/bank activity, growth modifiers, and legacy-like gold calculations so reconnects and init payloads stop dropping that context.",
        "Gateway REQUEST_TILE_DETAIL responses now add authoritative upkeep entries for owned settled tiles, so the town overview keeps its upkeep section instead of collapsing to a partial placeholder tile view."
      ]
    },
    {
      introducedIn: "2026.04.17.11",
      title: "Rewrite town detail panels now repair partial support-town payloads instead of surfacing stub zeroes",
      why: "The rewrite tile-detail bridge could still send placeholder town summaries with zeroed support, zero gold, and missing upkeep context, which made real towns look unfed, rendered support as undefined, and could hide the upkeep or modifier sections even when nearby support structures and food tiles were present.",
      changes: [
        "Rewrite town-detail normalization now treats clearly stubbed non-settlement town payloads as placeholders and derives support, fed state, market/granary/bank activity, food upkeep, and fallback production values from nearby authoritative visible tiles instead of trusting the zeroed bridge payload.",
        "Town detail views now render concrete support counts and keep the upkeep/modifier sections alive when the surrounding support state is visible, rather than mixing live headline values with placeholder zeroes from the partial rewrite summary."
      ]
    },
    {
      introducedIn: "2026.04.17.10",
      title: "Rewrite economy rates and stuck frontier recovery now match reality more closely",
      why: "The rewrite stack was still inventing a simplified economy where each settled tile paid 0.6 gold and each settled resource tile produced 1 per minute, which made town and grain income much too high versus legacy, and refresh could still bring back frontier targets that had only been queued locally but never accepted by the simulation.",
      changes: [
        "Rewrite player snapshots, world-status fallbacks, and runtime exports now use legacy-like town, dock, and strategic-resource rates instead of the old fake per-settled-tile economy.",
        "Queued frontier commands are no longer rehydrated after refresh unless the authoritative simulation already accepted them, so dead queued targets stop coming back as frozen 1/2 queue badges after a reload."
      ]
    },
    {
      introducedIn: "2026.04.17.9",
      title: "Rewrite economy and DB pressure now fail less misleadingly on Fly playtests",
      why: "The Fly playtest economy panel could still show 'No current income' even while the top-line gross and net numbers were positive, and the split simulation was still opening multiple tiny Postgres pools against the same small database, increasing the odds of event-persist stalls under playtest load.",
      changes: [
        "The economy panel now shows a live fallback income row whenever the session has positive gross rates but the detailed source buckets have not arrived yet, instead of claiming there is no income at all.",
        "Split gateway and simulation Postgres helpers now reuse a single pool per connection string inside each process, so commands, events, and snapshots stop competing with separate tiny pools for the same Fly Postgres capacity."
      ]
    },
    {
      introducedIn: "2026.04.17.8",
      title: "Rewrite bootstrap no longer pretends nearby land is loading after a SERVER_STARTING outage",
      why: "The client could already receive the retryable SERVER_STARTING error from the gateway, but if session bootstrap had partially initialized first, the map overlay could still sit on 'Loading nearby land...' with zero chunks instead of reflecting that the simulation was unavailable.",
      changes: [
        "Retryable rewrite bootstrap errors like SERVER_STARTING now reset the client back into a disconnected bootstrap state instead of leaving it in the misleading initialized-without-chunks path.",
        "That keeps the map loading overlay and auth retry flow aligned with the actual backend condition when the simulation drops during bootstrap."
      ]
    },
    {
      introducedIn: "2026.04.17.7",
      title: "Rewrite Fly season startup now avoids duplicate seed-world memory spikes",
      why: "The Fly rewrite playtest simulation could still run out of memory while booting a season seed because it eagerly generated the full season world more than once and kept an extra full tile fallback copy around even after authoritative recovery had already produced the live state.",
      changes: [
        "Rewrite simulation startup now bootstraps the seed player set separately from full world generation, so season-profile boots do not pay for an extra whole-map allocation just to discover which AI players exist.",
        "The authoritative runtime now reuses those provided players instead of regenerating the full seed world again during constructor boot.",
        "Rewrite subscription and world-status snapshots now read directly from the recovered runtime state instead of retaining a second full fallback tile array, and the Fly simulation config now raises the Node heap ceiling to use the existing 512 MB machine more effectively."
      ]
    },
    {
      introducedIn: "2026.04.17.6",
      title: "Rewrite auth and health now surface simulation outages instead of hanging on Securing session",
      why: "The Fly rewrite playtest gateway could still accept a websocket and leave the browser stuck on Securing session while the simulation was crash-looping, because gateway auth waited forever for SubscribePlayer and the HTTP health route stayed green even when the simulation stream was dead.",
      changes: [
        "Rewrite gateway auth now times out stalled simulation subscribe calls and returns a retryable SERVER_STARTING error instead of leaving the browser pinned on Connecting your empire.",
        "Rewrite gateway health now reports real simulation connectivity and returns a failing status when the simulation ping path is down, so operational checks stop treating a dead sim stream like a healthy backend.",
        "Seed-profile rewrite simulations can now fall back to their generated season world if durable startup recovery times out, preventing the playtest stack from crash-looping forever on stale recovery state."
      ]
    },
    {
      introducedIn: "2026.04.17.5",
      title: "Production rewrite season-status pushes now back off instead of competing with your next click",
      why: "The split production-proof stack was emitting a full leaderboard and season-victory payload after every tile change, which could compete with the next frontier enqueue even after the main queued-command path was trimmed down.",
      changes: [
        "Rewrite season-status broadcasts are now coalesced behind a short debounce instead of rebuilding and pushing a full global-status payload on every single tile delta batch.",
        "Leaderboard and season-victory panels still stay live, but repeated frontier actions no longer pay that full status-broadcast cost on every immediate follow-up click."
      ]
    },
    {
      introducedIn: "2026.04.17.4",
      title: "Production rewrite command queueing now avoids one extra DB round trip before the queued ACK",
      why: "The split Fly gateway was still pre-reading the durable command store for every client sequence before it wrote the queued command, which added another remote Postgres round trip on the path that decides when COMMAND_QUEUED reaches the browser.",
      changes: [
        "The rewrite gateway now persists a newly queued command through a single primary SQL write path instead of doing a separate duplicate-check read first.",
        "Duplicate client sequence retries still resolve to the original durable command identity, but the common non-duplicate path no longer burns that extra database hop before the queued acknowledgement."
      ]
    },
    {
      introducedIn: "2026.04.17.3",
      title: "Snapshot-backed rewrite players now recover manpower correctly on the split stack",
      why: "The production-proof rewrite environment could boot the right snapshot world but still leave real players stuck at zero usable manpower because the split simulation was treating snapshot manpower as a frozen number instead of recovering it from elapsed time.",
      changes: [
        "The rewrite simulation now preserves legacy snapshot manpower timestamps and cap snapshots when it hydrates players into the authoritative runtime.",
        "Authoritative player snapshots and command validation now refresh manpower from elapsed time before rendering HUD state or checking frontier costs, so snapshot-backed players regain usable manpower on the split stack."
      ]
    },
    {
      introducedIn: "2026.04.17.2",
      title: "Production rewrite auth no longer blocks INIT on a second snapshot refresh or hanging DB recovery reads",
      why: "The split Fly gateway could accept a websocket and then stall forever before INIT because control-channel auth synchronously forced one more SubscribePlayer roundtrip and also waited on gateway recovery queries with no timeout, so one bad simulation or Postgres socket could wedge the whole bootstrap path.",
      changes: [
        "Control-channel auth now reuses the first authoritative simulation snapshot it already fetched for the socket instead of synchronously blocking INIT on a second refresh call.",
        "Gateway reconnect recovery now times out stalled next-client-sequence and unresolved-command reads, falling back to an empty recovery state instead of hanging the websocket forever.",
        "Gateway and simulation Postgres pools now use fail-fast connection and query timeouts with keepalive enabled so broken DB sockets surface as errors instead of leaving rewrite bootstrap and persistence calls stuck indefinitely.",
        "Production gateway bootstrap no longer invents a seed-world ownership view when the simulation has no authoritative tiles for the player, preventing fake home-tile ownership from disagreeing with the next authoritative command validation."
      ]
    },
    {
      introducedIn: "2026.04.17.1",
      title: "Production rewrite simulation now avoids one more full-history boot scan and defers heavy snapshots on Fly",
      why: "The split production simulation could still reread the full durable command history after startup recovery and then trigger heavyweight checkpoints too aggressively for a 512 MB Fly machine, which kept the gateway disconnected because the simulation repeatedly died before staying stream-ready.",
      changes: [
        "The production rewrite simulation now reuses the already recovered command history to seed AI and system client sequence counters instead of loading the entire command table a second time during boot.",
        "Fly production simulation config now defers snapshot checkpoints much more aggressively and applies lower memory-watermark guardrails so checkpoints stop preempting rewrite uptime on the 512 MB split machine.",
        "Gateway control-channel auth now refreshes the player's authoritative simulation snapshot before emitting INIT, reducing stale ownership/bootstrap mismatches after split-stack reconnects."
      ]
    },
    {
      introducedIn: "2026.04.16.14",
      title: "Rewrite frontier tiles now recover automatically after a delayed sync expires",
      why: "A delayed rewrite expand could preserve the optimistic frontier tile while the client waited for authoritative sync, but if no tile delta ever arrived after that wait window, the tile could stay visually stuck until the browser was refreshed.",
      changes: [
        "The client now sweeps expired frontier-sync wait windows and automatically reverts stale optimistic expand tiles instead of leaving them wedged until the next full reconnect.",
        "When that stale recovery kicks in, the client also refreshes nearby tiles and clears the queued target state so the frontier queue can continue without a manual reload."
      ]
    },
    {
      introducedIn: "2026.04.16.13",
      title: "Rewrite leaderboard rankings and live season-status updates now reflect real competition",
      why: "The rewrite stack could still rank empires by raw gold instead of gameplay score, include barbarians in the main leaderboard, and leave the leaderboard panel stale until a refresh even while AI empires were growing in the background.",
      changes: [
        "Rewrite leaderboard rows now use the same settled-land, income, and tech score formula as the legacy season status instead of falling back to raw player gold.",
        "Barbarians are no longer included in rewrite leaderboard rankings or season-victory contender calculations.",
        "The split simulation now pushes live GLOBAL_STATUS_UPDATE messages after tile and tech changes, and the gateway keeps its cached rewrite snapshot world status in sync so open panels and later reconnects see the same rankings."
      ]
    },
    {
      introducedIn: "2026.04.16.12",
      title: "Rewrite localhost now uses lighter command acceptance and real AI settle growth",
      why: "The split rewrite stack still had avoidable work on the acceptance path, and the localhost 20-AI proof world could look frozen because the AI only expanded frontier without settling that land into visible leaderboard and season-goal progress.",
      changes: [
        "The rewrite simulation no longer repeats the gateway's queued-command durability write before processing a command, trimming one redundant database transaction out of the acceptance path.",
        "Per-player runtime summaries now track owned territory, settled land, development slots, and strategic production incrementally, so player updates and reconnect bootstrap no longer rescan the whole world to rebuild those numbers.",
        "Local rewrite AI now mixes settlement into its automation flow instead of only claiming frontier, so the localhost leaderboard and season-victory panels start reflecting real growth rather than staying pinned near one settled tile.",
        "The localhost rewrite soak harness now skips barrier tiles instead of treating sea or mountains as valid frontier candidates during latency measurement."
      ]
    },
    {
      introducedIn: "2026.04.16.11",
      title: "Rewrite localhost AI no longer stalls behind a single bad frontier target",
      why: "The fresh 20-AI season seed could leave an AI spawn next to barrier terrain, and the rewrite AI producer always retried players from the top of the list, so one AI spamming rejected barrier expands could make the whole local season look frozen.",
      changes: [
        "The rewrite frontier planner now skips sea and mountain tiles when picking automatic expand or attack targets.",
        "The rewrite AI producer now rotates fairly across AI players instead of restarting at the first player every tick, so one repeatedly rejected AI cannot starve the rest of the local season."
      ]
    },
    {
      introducedIn: "2026.04.16.10",
      title: "Queued development actions now survive refresh in the same browser session",
      why: "Queued settle and build actions that had not started yet lived only in browser memory, so a refresh could silently discard the local development queue even when the world state was otherwise intact.",
      changes: [
        "The client now persists the local development queue in session storage for the active player, so queued settle and build actions come back after a refresh in the same tab session.",
        "Restored entries are filtered against the latest authoritative tile state and active pending settlements, so stale queue items are dropped instead of resubmitting work that already started or no longer applies."
      ]
    },
    {
      introducedIn: "2026.04.16.9",
      title: "The default 20-AI rewrite localhost restart now uses durable Postgres recovery",
      why: "The previous localhost 20-AI review flow always reseeded the world on restart, which meant refresh-driven debugging and restart testing could wipe local rewrite progress instead of proving the split stack's recovery behavior.",
      changes: [
        "The default `rewrite:restart:20ai` script now starts the local rewrite stack against the rewrite Postgres command, event, and snapshot stores through a Fly proxy so progress survives local restarts.",
        "A separate `rewrite:restart:20ai:seed` script is still available when you explicitly want a clean fresh-world reset instead of durable recovery."
      ]
    },
    {
      introducedIn: "2026.04.16.8",
      title: "Settled resource tiles no longer come back as fake towns after refresh",
      why: "The rewrite simulation was incorrectly inventing a fallback town for every completed settlement, so reloading after settling grain or other resource tiles could turn ordinary settled land into bogus settlement-town tiles with the wrong UI and economy side effects.",
      changes: [
        "Ordinary SETTLE completions on the rewrite localhost stack now finish as settled land without creating a synthetic town object.",
        "Restarting the rewrite simulation also strips previously bugged auto-generated `Settlement x,y` town records from recovered state, so old fake settlement icons on resource tiles are cleared on reload."
      ]
    },
    {
      introducedIn: "2026.04.16.7",
      title: "Rewrite refreshes now keep the real leaderboard and season goals",
      why: "The rewrite gateway was rebuilding global season status from the player's visible tiles during init, which made hidden AI empires collapse to settled 0 on refresh and dropped season victory goals entirely on seed-profile boots.",
      changes: [
        "Rewrite subscription snapshots now carry authoritative world-status data from the simulation, including leaderboard rankings and season victory objective progress.",
        "Reconnect and refresh on the rewrite localhost stack now use that authoritative world status instead of guessing from visible tiles, so AI standings and season goals survive refresh."
      ]
    },
    {
      introducedIn: "2026.04.16.6",
      title: "Rewrite localhost now enforces development slots and live economy state",
      why: "The split simulation was still allowing unlimited parallel settlements with debug-sized starting resources, and reconnects could fall back to seed defaults instead of the live player economy state.",
      changes: [
        "Settlement and structure development on the rewrite localhost stack now respect the same development-slot cap before new work can start.",
        "Settlement commands now spend gold, track pending settlement state authoritatively, and refresh the player HUD as slots open and close.",
        "Reconnect bootstrap now prefers the live simulation player snapshot, so gold, manpower, income, and pending development no longer reset to fake seed values after refresh."
      ]
    },
    {
      introducedIn: "2026.04.16.5",
      title: "Routine frontier queueing no longer opens a warning popup",
      why: "The rewrite gateway emits COMMAND_QUEUED before authoritative acceptance, and the client was treating that normal intermediate state like a warning every time you launched a frontier action.",
      changes: [
        "Normal queued frontier actions now stay in the inline queue state instead of opening the large warning card immediately.",
        "Recovery, timeout, and real error states still use the popup flow, so the debug-log path remains available when confirmation actually stalls."
      ]
    },
    {
      introducedIn: "2026.04.16.4",
      title: "Bulk frontier drag selection no longer auto-submits captures",
      why: "Shift-dragging across neutral tiles could immediately queue a long frontier-claim chain on mouseup, which made accidental drag-selection look like the server was expanding territory on its own.",
      changes: [
        "Releasing a box selection now opens the bulk tile action menu instead of auto-queuing frontier claims.",
        "Bulk frontier captures still work, but they now require an explicit menu action so accidental drag paths cannot silently enqueue a long expand chain."
      ]
    },
    {
      introducedIn: "2026.04.16.3",
      title: "Rewrite localhost 20-AI restart now boots a real season world",
      why: "The previous 20-AI rewrite seed was only a small hand-authored stress rectangle, which made localhost validation look obviously fake and blocked meaningful parity testing on generated terrain.",
      changes: [
        "The `rewrite:restart:20ai` path now starts the rewrite stack on a full generated season map instead of the rectangular stress fixture.",
        "That localhost profile now includes real world terrain, neutral towns, docks, shard caches, and 20 AI capitals placed with season-style spacing and nearby economy checks."
      ]
    },
    {
      introducedIn: "2026.04.16.2",
      title: "Rewrite localhost now covers the remaining crystal actions, bombardment, and shard collection",
      why: "Broader rewrite validation was still blocked by the last unsupported admin and crystal-action slice, which forced local parity checks back onto the legacy runtime whenever reveal, siphon, terrain shaping, airport bombardment, or shard collection entered the test path.",
      changes: [
        "REVEAL_EMPIRE, REVEAL_EMPIRE_STATS, CAST_AETHER_BRIDGE, CAST_AETHER_WALL, SIPHON_TILE, PURGE_SIPHON, CREATE_MOUNTAIN, REMOVE_MOUNTAIN, AIRPORT_BOMBARD, and COLLECT_SHARD now queue through the rewrite gateway and simulation services instead of failing as unsupported.",
        "Rewrite tile batches now carry sabotage and shard-site state so siphon, purge, terrain shaping, and shard pickup flows can be exercised on localhost without dropping their visible tile state."
      ]
    },
    {
      introducedIn: "2026.04.16.1",
      title: "Rewrite localhost now handles territory abandonment and converter toggles",
      why: "Local rewrite validation still hit capability walls for a few common tile actions, which meant parity passes could falsely look broken simply because the new gateway rejected actions the legacy server already understood.",
      changes: [
        "UNCAPTURE_TILE now queues through the rewrite gateway and simulation path instead of failing as unsupported.",
        "SET_CONVERTER_STRUCTURE_ENABLED and OVERLOAD_SYNTHESIZER now follow the same durable rewrite command flow, so converter state changes and synth overload cooldowns can be exercised on localhost without falling back to legacy."
      ]
    },
    {
      introducedIn: "2026.04.15.9",
      title: "Attack launches now surface manpower blockers as actionable popups",
      why: "Trying to launch an attack without enough manpower was only surfacing as a raw server error in the console, which made it too easy to miss the built-in debug download path when diagnosing failed launches.",
      changes: [
        "Insufficient-manpower attack rejections now open the same warning popup flow used by other actionable frontier blockers instead of only printing a red console error.",
        "Those launch failures still reset the in-flight action cleanly and keep the popup's debug-download button available for faster local troubleshooting."
      ]
    },
    {
      introducedIn: "2026.04.15.8",
      title: "Frontier desync and dock-cooldown failures now surface with actionable popups",
      why: "Expand failures caused by stale local ownership and dock-endpoint cooldowns were only showing up as raw server errors in the console, which made it harder to notice desyncs and download a debug log quickly.",
      changes: [
        "Dock crossing cooldowns now use the same warning-popup path as other frontier attack blockers instead of only printing a red server error.",
        "Expand attempts that the server rejects because the tile is already owned now open a frontier resync warning that points you at the popup's debug-log download flow."
      ]
    },
    {
      introducedIn: "2026.04.15.7",
      title: "Settlement menus no longer crash on partial rewrite tile data",
      why: "The localhost rewrite snapshot path could still open a settlement overview before every numeric town field had been hydrated, which caused the tile menu renderer to throw instead of falling back safely.",
      changes: [
        "Settlement overview copy now treats missing rewrite gold-per-minute values as zero instead of crashing the tile action menu.",
        "Added a regression test around the settlement overview path so partial snapshot-backed town payloads no longer take down the client UI."
      ]
    },
    {
      introducedIn: "2026.04.15.6",
      title: "Snapshot-backed town overviews now carry real growth modifiers",
      why: "The rewrite snapshot bridge was still flattening town state into a reduced summary, so town overviews could miss live modifier rows like Long-term peace even when the underlying season snapshot had enough information to derive them.",
      changes: [
        "Town payloads produced by the localhost rewrite snapshot bridge now carry growth modifier data derived from the snapshot's active capture and war shock state.",
        "Fed settled towns on the rewrite localhost path can now show the same growth-modifier rows the client already understands instead of silently dropping them during bootstrap."
      ]
    },
    {
      introducedIn: "2026.04.15.5",
      title: "Rewrite localhost now keeps profile and tile-color edits through reconnects",
      why: "The rewrite gateway was still blocking SET_PROFILE and SET_TILE_COLOR, so local validation could drift back to snapshot or auth defaults after a reconnect even when the browser had already changed your banner name or color.",
      changes: [
        "SET_PROFILE and SET_TILE_COLOR now go through the rewrite localhost gateway instead of being treated as unsupported actions.",
        "Runtime profile overrides now flow back into INIT, leaderboard names, and player-style updates so reconnects on the running rewrite session keep the active banner name and tile color."
      ]
    },
    {
      introducedIn: "2026.04.15.4",
      title: "Rewrite structure lifecycle now clears map state correctly",
      why: "The rewrite path could start handling fort and structure removal on the server while still leaving stale fortifications and structures painted on the client, because cleared structure fields were being dropped out of tile deltas before they reached the browser.",
      changes: [
        "Rewrite fort and structure cancel/remove actions now propagate explicit cleared structure fields through the simulation and gateway tile-delta pipeline.",
        "Local validation should now show removed forts and structures disappearing from the map immediately instead of lingering until a full refresh."
      ]
    },
    {
      introducedIn: "2026.04.15.3",
      title: "Rewrite tile detail now uses live gateway state instead of fake town summaries",
      why: "The localhost rewrite path could successfully bootstrap into the correct season and still show fake town overview data, because tile-detail requests were being ignored and the client fell back to a lossy summary builder.",
      changes: [
        "The rewrite gateway now answers REQUEST_TILE_DETAIL from the live per-player snapshot instead of ignoring it as a legacy-only message.",
        "Per-player rewrite snapshots now stay updated from tile-delta batches, so town, fort, observatory, siege outpost, and economic structure details stay current after bootstrap.",
        "Expanded fort overlay regression coverage to verify directional fort ring selection against nearby friendly and hostile fortifications."
      ]
    },
    {
      introducedIn: "2026.04.15.2",
      title: "Rewrite localhost now accepts siege outpost and economic structure builds",
      why: "The split rewrite gateway was still blocking a core structure-build slice, which meant local parity validation could not prove that late-opening military and economy structures worked through the new command bus.",
      changes: [
        "Added rewrite-gateway support for siege outpost and economic structure build commands so they now enqueue through the same durable command path as other migrated actions.",
        "The rewrite simulation now validates, starts, and completes siege outpost and economic structure builds instead of rejecting them as unsupported."
      ]
    },
    {
      introducedIn: "2026.04.15.1",
      title: "The public HQ can now show live season status",
      why: "The Border Empires homepage needed a safe public feed for leaderboard, victory pressure, and recent season winners without exposing the authenticated game websocket.",
      changes: [
        "Added a lean public HQ summary endpoint that serves cached leaderboard and victory-pressure data for the live season.",
        "Trimmed recent season archives into a homepage-friendly feed so crowned empires and recent winners can be shown without shipping full replay history."
      ]
    },
    {
      introducedIn: "2026.04.14.15",
      title: "Bridge debug is easier to copy and domain costs use rewrite requirement fields",
      why: "Local rewrite validation still made it too hard to copy the active bridge state, and doctrine cards were falling back to Cost not listed even when the gateway had sent explicit costs.",
      changes: [
        "The bridge status block above logout now includes a copy button for the live bridge/bootstrap/season/tile summary.",
        "Domain cards now format costs from the rewrite gold and resource requirement fields when checklist labels are missing."
      ]
    },
    {
      introducedIn: "2026.04.14.14",
      title: "Rewrite localhost actions now send stable command metadata",
      why: "Some migrated rewrite actions were still going out as raw websocket messages without command ids and sequence numbers, which caused BAD_COMMAND errors instead of real gameplay validation.",
      changes: [
        "Queued frontier attacks and expansions now attach rewrite command ids and client sequence numbers before they hit the socket.",
        "Settlement, collect, research, and domain picks sent through the shared rewrite path now get the same command metadata automatically.",
        "Localhost rewrite debugging should now show real command-envelope traffic instead of failing on invalid payload errors."
      ]
    },
    {
      introducedIn: "2026.04.14.13",
      title: "Snapshot bridge resource rates now use real per-minute reconstruction",
      why: "The rewrite snapshot bridge was still reading buffered strategic tile-yield values like live per-minute production, which inflated resource income and made the economy panel mathematically wrong.",
      changes: [
        "Strategic resource rates on the localhost rewrite snapshot bridge now reconstruct from settled resource tiles and active converter structures instead of treating buffered yield state as a rate.",
        "Gold and resource source rows now line up with the corrected per-minute values instead of showing inflated bridge-only totals."
      ]
    },
    {
      introducedIn: "2026.04.14.12",
      title: "Rewrite victory popups now include plunder details again",
      why: "The client-side victory popup formatter already knew how to show pillaged gold and resources, but the split rewrite combat runtime was not emitting those fields for settled captures.",
      changes: [
        "Settled captures on the rewrite localhost stack now emit pillaged gold and strategic-resource details through the split simulation and gateway path.",
        "Victory popups can show what was plundered instead of collapsing to a bare conquered-terrain message."
      ]
    },
    {
      introducedIn: "2026.04.14.11",
      title: "Snapshot economy now uses the real settled tile yields",
      why: "The rewrite snapshot bridge was still mixing fake town and dock formulas with real strategic tile yields, which made the top bar and economy panel disagree about resource income.",
      changes: [
        "Rewrite snapshot bootstrap now derives gold and strategic production from the same settled tile-yield data that exists in the saved snapshot.",
        "Economy source rows now line up with the displayed gross rates instead of inventing mismatched totals from placeholder bridge math."
      ]
    },
    {
      introducedIn: "2026.04.14.10",
      title: "Rewrite leaderboard now shows season victory pressure again",
      why: "The snapshot-backed rewrite gateway was hardcoding an empty season-victory list, so the leaderboard lost the objective cards even when the snapshot already had enough world state to compute them.",
      changes: [
        "The rewrite bootstrap now derives all five season victory objective rows from the snapshot-backed world state instead of sending an empty array.",
        "Objective cards now include leaders, progress labels, thresholds, and your own comparative progress again during localhost rewrite validation."
      ]
    },
    {
      introducedIn: "2026.04.14.9",
      title: "Unsupported rewrite actions now stop locally",
      why: "Unmigrated rewrite actions like alliance requests were still leaking through to the gateway and surfacing as raw server UNSUPPORTED errors.",
      changes: [
        "The client now checks the rewrite gateway capability list before sending a gameplay message.",
        "Unsupported rewrite actions show a local Action unavailable warning instead of surfacing as a server error.",
        "This applies to the remaining unmigrated rewrite actions, not just alliance requests."
      ]
    },
    {
      introducedIn: "2026.04.14.8",
      title: "Frontier claims no longer masquerade as combat victories",
      why: "Rewrite frontier expansion was still borrowing combat timing and result labels, which made claims feel too slow, showed a generic Victory popup, and blocked chained expand queues behind the wrong state machine.",
      changes: [
        "Changed rewrite expand timing to use frontier-claim duration instead of combat lock duration, so accepted expansion resolves on the shorter claim timer.",
        "Forwarded rewrite result action type through the gateway so successful neutral expansion shows the territory-claim result path instead of a generic Victory popup.",
        "Allowed click-queued neutral expansion chains to treat an in-flight claimed frontier tile as a valid optimistic origin, so the next adjacent claim can queue behind the one already resolving."
      ]
    },
    {
      introducedIn: "2026.04.14.7",
      title: "Snapshot-bridge economy now shows real rates and source breakdowns",
      why: "The rewrite snapshot bridge was still feeding the HUD a bogus gold-per-minute total and no income source buckets, which made the economy panel look broken even when the snapshot itself had valid towns, docks, and strategic stock.",
      changes: [
        "Rewired snapshot bootstrap to use the dedicated bridge economy builder for town, dock, structure, upkeep, and strategic production reconstruction instead of summing raw tile-yield gold.",
        "The rewrite INIT payload now includes economy breakdown and upkeep contributor data, so the economy panel can show source rows and per-resource upkeep instead of falling back to blank placeholders."
      ]
    },
    {
      introducedIn: "2026.04.14.6",
      title: "Rewrite snapshot bootstrap now uses the real season world around your empire",
      why: "The rewrite bridge was still running its authoritative world on a tiny default seed and only overlaying snapshot ownership, which made visibility radius fixes useless because there was almost no terrain to reveal.",
      changes: [
        "Changed the rewrite snapshot bridge to seed the full season terrain into the simulation runtime while still only sending player-visible tiles to the client bootstrap.",
        "This restores the expected land, coast, and nearby world shape around owned territory instead of collapsing visible play into isolated snapshot dots."
      ]
    },
    {
      introducedIn: "2026.04.14.5",
      title: "Rewrite snapshot bootstrap now respects visibility radius and restores economy values",
      why: "Local rewrite validation was still booting with a too-small vision halo and zeroed economy rates, which made the snapshot bridge look much more broken than the underlying world state actually was.",
      changes: [
        "Expanded rewrite snapshot bootstrap visibility from a one-tile placeholder halo to the same radius-based player and ally reveal model used by the live game.",
        "Restored snapshot-bridge income and strategic resource fields in the rewrite INIT payload so localhost HUD rates no longer boot as zero when the snapshot already has live economy data."
      ]
    },
    {
      introducedIn: "2026.04.14.4",
      title: "Rewrite localhost validation now matches frontier rules and debug tooling more closely",
      why: "Local rewrite testing was still producing false negatives from gateway debug fetch failures, diagonal frontier mismatches, and partial snapshot-map hydration that did not match the live game's world shape.",
      changes: [
        "Fixed rewrite frontier validation to accept the same diagonal neighboring attacks as the legacy server instead of incorrectly rejecting them as not adjacent.",
        "Restored debug-bundle compatibility on the rewrite gateway by adding CORS-safe health and runtime debug endpoints for localhost browser downloads.",
        "Expanded the legacy snapshot bridge to reconstruct the full seeded world terrain before overlaying snapshot ownership, towns, and resources so localhost rewrite maps stop rendering as chopped fragments."
      ]
    },
    {
      introducedIn: "2026.04.14.3",
      title: "The localhost rewrite bridge now handles more core actions directly",
      why: "Local parity testing kept failing on unsupported rewrite actions, which made it too easy to misjudge the new gateway path before deployment.",
      changes: [
        "Moved visible collection and tile collection onto the rewrite gateway path so they queue and resolve through the split gateway and simulation services instead of failing as unsupported.",
        "Moved technology and domain selections onto the rewrite command path as well, so localhost rewrite validation now exercises those flows through the new backend instead of stopping at a gateway capability wall."
      ]
    },
    {
      introducedIn: "2026.04.14.2",
      title: "The logout card now shows which realtime bridge path you are on",
      why: "Local rewrite testing was too opaque because it was easy to accidentally connect to the wrong websocket path and not notice until a debug bundle or server error exposed it.",
      changes: [
        "Added a live bridge-status readout above the logout button showing the websocket target, rewrite vs legacy mode, bootstrap mode, season id, and initial tile count.",
        "Pointed localhost client websocket defaults at the rewrite gateway host binding so local bridge validation uses the intended server path by default."
      ]
    },
    {
      introducedIn: "2026.04.14.1",
      title: "Sent alliance requests now stay pending until someone resolves them",
      why: "Alliance requests were silently disappearing after a few minutes because the server treated them like temporary offers instead of keeping them around until accepted, rejected, or canceled.",
      changes: [
        "Stopped auto-expiring alliance requests on the server, so sent and received alliance offers stay visible until one side resolves them.",
        "Blocked duplicate alliance requests between the same two players while one is already pending, which keeps the persistent request list from filling with repeats."
      ]
    },
    {
      introducedIn: "2026.04.13.12",
      title: "Alliance requests now suggest matching player names as you type",
      why: "The new alliance field looked like a selector in the reference UI, but it had no suggestion list and its padded input could still overrun the right edge of the sidebar.",
      changes: [
        "Added live alliance target suggestions from known player names, leaderboard entries, and current social contacts so partial names can be picked from the dropdown.",
        "Fixed the alliance input and button box sizing so the dark field layout stays inside the sidebar without spilling past the right edge."
      ]
    },
    {
      introducedIn: "2026.04.13.11",
      title: "The alliance tab now uses the reference layout without changing sidebar behavior",
      why: "The prior pass changed the sidebar shell itself and still let the shared bright input and button styles leak into the alliance tab, so the result did not match the supplied UI.",
      changes: [
        "Restored the normal sidebar container behavior so the alliance tab opens, sizes, and offsets like the other side panels again.",
        "Raised the alliance tab styling specificity so its dark reference inputs, buttons, section dividers, and request cards render consistently instead of inheriting the shared white panel controls."
      ]
    },
    {
      introducedIn: "2026.04.13.10",
      title: "The alliance tab now mirrors the new reference layout more closely",
      why: "The first social-panel pass kept too much of the game's old panel styling and still did not match the attached reference layout for pending alliance and truce cards.",
      changes: [
        "Rebuilt the alliance tab around the reference panel chrome, section spacing, card surfaces, and button treatments instead of adapting the older HUD card style.",
        "Pending alliance and truce sections now mix incoming requests with outgoing requests, showing accept or reject actions for incoming offers and cancel actions for requests you already sent."
      ]
    },
    {
      introducedIn: "2026.04.13.9",
      title: "The alliance tab now uses a dedicated social-panel layout",
      why: "Alliance management had stayed in a bare utility layout, which made requests harder to scan and offered no direct way to reject incoming alliance or truce offers.",
      changes: [
        "Redesigned the alliance tab with sectioned cards for allies, truces, and incoming requests so social status is easier to scan on desktop and mobile.",
        "Added reject actions for incoming alliance and truce requests so offers can be dismissed directly from the tab instead of only waiting for them to expire."
      ]
    },
    {
      introducedIn: "2026.04.13.8",
      title: "Captured settlement-tier towns relocate correctly again",
      why: "Some towns that were still at settlement tier could survive conquest on the captured tile if they had lost their original settlement flag, which also let the defeated owner get a fallback settlement elsewhere.",
      changes: [
        "Made conquest relocation depend on the town's current settlement tier instead of a legacy settlement flag.",
        "Settlement-tier towns now move off captured tiles consistently, while towns, cities, great cities, and metropolises still remain in place after conquest."
      ]
    },
    {
      introducedIn: "2026.04.13.7",
      title: "Late-game barbarian spawns no longer pile into tiny fog pockets",
      why: "Once most of the map was revealed, maintenance spawns could keep landing in the same small unexplored island gaps and create sudden barbarian explosions.",
      changes: [
        "Maintenance spawns now require a larger surrounding fog buffer instead of treating a single dark tile as enough.",
        "Added extra separation between fresh barbarian maintenance spawns so one leftover pocket does not instantly stack a dense cluster."
      ]
    },
    {
      introducedIn: "2026.04.13.6",
      title: "Server ownership and snapshot runtime were split into smaller modules",
      why: "Large ownership, snapshot load/save, and player bootstrap blocks still lived in the main server runtime, which made production-safe fixes harder than they needed to be.",
      changes: [
        "Split server ownership updates, snapshot IO, snapshot hydrate, and player runtime support into focused modules under the 500-line file target.",
        "Kept server and client regression coverage green after the refactor so live gameplay behavior stays stable while the server runtime gets easier to maintain."
      ]
    },
    {
      introducedIn: "2026.04.13.5",
      title: "AI leaders now repivot and punish weak borders more aggressively",
      why: "Too many AI empires were getting stuck on low-value long-term plans, staying passive near humans, and failing to turn economic leads into real pressure.",
      changes: [
        "Added emergency victory-path repivots when an AI is clearly on a dead-end objective and another path is materially stronger.",
        "Made town-control and economic AIs more willing to break passive postures and attack soft enemy borders when they have a real opening.",
        "Taught economic AIs to value connected, higher-payoff towns more directly so Markets and Banks are used for compounding instead of generic expansion only."
      ]
    },
    {
      introducedIn: "2026.04.13.4",
      title: "Server AI planning internals were split into smaller modules",
      why: "The live server still had large AI frontier-selection and victory-planning blocks inside the main runtime file, which made fixes riskier even when behavior stayed the same.",
      changes: [
        "Split AI planning types, frontier selection helpers, frontier planning helpers, and victory-path scoring into focused server modules.",
        "Kept full server and client regression coverage green after the refactor so live AI behavior stays stable while the server runtime gets easier to maintain."
      ]
    },
    {
      introducedIn: "2026.04.13.3",
      title: "Loaded saves no longer regenerate towns on startup",
      why: "A startup validation path could rebuild the strategic world under an existing save, which made some owned town tiles come back with the wrong town identity after a restart.",
      changes: [
        "Stopped strategic world regeneration from running when the server successfully loaded a saved snapshot.",
        "Added regression coverage so loaded saves keep their own towns, docks, and clusters instead of silently replacing them at boot."
      ]
    },
    {
      introducedIn: "2026.04.13.2",
      title: "The changelog now shows only what you have not seen",
      why: "Once the release log grew across several updates, returning players had to scroll through old entries they had already read before they could dismiss the popup.",
      changes: [
        "Filtered the changelog popup to show only entries introduced after the version last seen on this device.",
        "Kept older entries out of the current popup once they were already acknowledged in a previous release."
      ]
    },
    {
      introducedIn: "2026.04.13.2",
      title: "Continue now stays visible while you scroll",
      why: "The release log can be long enough that forcing players to reach the bottom just to dismiss it adds friction every time a new update ships.",
      changes: [
        "Moved the continue action into a sticky top bar inside the changelog modal.",
        "Kept the top bar visible while scrolling so the popup can be dismissed from any point in the log."
      ]
    },
    {
      introducedIn: "2026.04.13.1",
      title: "AI frontier planning was split into smaller server modules",
      why: "The live server still had large AI frontier-planning blocks inside one runtime file, which made future fixes riskier even when gameplay behavior stayed the same.",
      changes: [
        "Split AI frontier territory, scout, settlement, signal, and pressure helpers into focused server modules under the 500-line file target.",
        "Kept full server and client regression coverage green after the refactor so the live AI/runtime path stays behaviorally stable."
      ]
    },
    {
      introducedIn: "2026.04.13.1",
      title: "Frontier attack sync now keeps the original combat alive",
      why: "Repeated border attacks could desync after delayed server acknowledgements, which made capture timers restart, queue duplicate sends, and hid the data needed to debug player reports.",
      changes: [
        "Kept delayed attack acknowledgements bound to the original frontier action instead of re-dispatching duplicate sends after a missed 2-second acceptance window.",
        "Added downloadable debug bundles on sync failure popups so client attack logs, server health, and recent server timing traces can be shared directly for investigation.",
        "Reduced several server-side hot paths around AI scheduling, dock-crossing validation, chunk sync priority, and post-combat follow-up so frontier actions clear more predictably under load."
      ]
    },
    {
      introducedIn: "2026.04.13.1",
      title: "Town names now stay stable across restarts",
      why: "Some towns could come back from a restart with the wrong generated name, which made it look like the town at a tile had changed identity.",
      changes: [
        "Loaded season seed data before filling in any missing town names during snapshot hydrate.",
        "Removed an obsolete legacy town-hydrate normalization path that no longer matched live save data."
      ]
    },
    {
      introducedIn: "2026.04.13.1",
      title: "Under-the-hood server sync was split into safer modules",
      why: "The live server had grown into one large runtime file, which made future fixes riskier than they needed to be even when behavior stayed the same.",
      changes: [
        "Split more of the server's visibility, chunk sync, combat support, realtime sync, and player update wiring into focused modules.",
        "Kept the same gameplay behavior while adding regression coverage around frontier combat results and leaderboard/player-update payloads."
      ]
    },
    {
      introducedIn: "2026.04.12.5",
      title: "Changelog scrolling now stays where you left it",
      why: "The release-notes popup could jump back to the top while the HUD refreshed underneath it, which made longer updates frustrating to read.",
      changes: [
        "Stopped rebuilding the changelog modal on every HUD render while the same release is open.",
        "Preserved the popup scroll position so long changelog entries stay stable while you read them."
      ]
    },
    {
      introducedIn: "2026.04.13.1",
      title: "Shard rain now pings fresh drop spots",
      why: "Shard rain was easy to miss because players had to manually spot each new shardfall tile while the event timer was already ticking down.",
      changes: [
        "Added animated minimap pings for newly revealed shardfall deposits during active shard rain.",
        "Staggered shardfall reveals over the first two minutes of shard rain and let each minimap ping persist for 30 seconds before clearing."
      ]
    },
    {
      introducedIn: "2026.04.12.4",
      title: "Plunder rewards now use resource icons",
      why: "The attack victory popup now lists stolen resources, but reading raw resource names is slower than scanning the same icons used elsewhere in the HUD.",
      changes: [
        "Updated plundered gold in the successful attack popup to use the gold icon.",
        "Updated plundered strategic resources in the same popup to use their matching resource icons."
      ]
    },
    {
      introducedIn: "2026.04.12.4",
      title: "Forts now demand real siege support",
      why: "Fortified border tiles were still too easy to brute-force, so forts now anchor territory more reliably unless the attacker stages from an outpost.",
      changes: [
        "Raised fort and wooden fort defensive strength so fortified tiles hold much more consistently.",
        "Buffed siege outposts, kept light outposts weaker than wooden forts, and heavily penalized attacks into fortified tiles that do not originate from an active outpost."
      ]
    },
    {
      introducedIn: "2026.04.12.4",
      title: "Successful attacks now show what you plundered",
      why: "When an attack succeeded, the battle timer popup confirmed the capture but did not show the gold and resources taken from the defender.",
      changes: [
        "Added plundered gold to the successful attack popup when a settled enemy tile is captured.",
        "Added any stolen strategic resources to the same popup so attack rewards are visible immediately."
      ]
    },
    {
      introducedIn: "2026.04.12.1",
      title: "Versioned release notes now appear after login",
      why: "Players could miss important changes between sessions, so each release now gets an in-game summary the next time that build loads.",
      changes: [
        "Added a changelog popup that opens after authentication when the current client build has not been seen on this device yet.",
        "Stored the latest seen changelog version in local storage so the popup stays hidden until a newer release is deployed."
      ]
    },
    {
      introducedIn: "2026.04.12.1",
      title: "Release note updates now have a dedicated source file",
      why: "Keeping release copy in one client module makes it much harder to ship UI changes without updating the player-facing summary.",
      changes: [
        "Centralized release note content in a dedicated changelog module used by the popup renderer.",
        "Added test coverage and README guidance so future updates keep the changelog current."
      ]
    }
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
