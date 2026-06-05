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
  version: "2026.06.05.1",
  title: "What's New",
  summary: "Empire Integrity, AI event loop stalls eliminated, turn rotation fixed, and alliance-safe waypoints.",
  entries: [
    {
      introducedIn: "2026.06.05.1",
      title: "Empire Integrity",
      why: "Your kingdom's shape now earns you more gold and faster city growth. A tight, fully-painted island scores higher and gets a bigger economy bonus. Open the Integrity panel to see your score and the bonus it gives you.",
      changes: [
        "The defensibility panel is now the Empire Integrity panel.",
        "Your integrity score drives an economy bonus — compact, well-painted empires earn more gold and grow cities faster.",
        "The panel now shows your current income and growth bonus from integrity."
      ]
    },
    {
      introducedIn: "2026.06.04.5",
      title: "AI sync no longer blocks the event loop",
      why: "syncPlayers was blocking the main thread for 322-403ms p99 on staging, causing gateway gRPC latency of 3s+ and periodic AI throttling. Three root causes fixed: relevance rebuild now skips building/tech mutations (only fires on ownership changes), the unseen-tile scan now only checks newly-relevant keys instead of all 100k+ global keys, and the 100k-key Set copy is eliminated.",
      changes: [
        "syncPlayers main-thread block drops from 403ms p99 to near-zero at steady state.",
        "Gateway command submit latency expected to drop from 3s p99 to under 500ms."
      ]
    },
    {
      introducedIn: "2026.06.04.4",
      title: "AI turn rotation fixed",
      why: "A no-command result from one AI could leave the worker scheduler pointed at the same player forever, so an eliminated or broke AI repeatedly nooped while richer AI empires stopped receiving turns.",
      changes: [
        "AI turn scheduling now advances after a first-pass noop, letting the next AI empire plan on the following tick.",
        "AI command submissions are now rate-limited per empire, so a recovered loop cannot flood the simulation with rapid expand/attack/build commands.",
        "Staging's repeated `ai-2:insufficient_points` loop is now covered by a regression test."
      ]
    },
    {
      introducedIn: "2026.06.04.4",
      title: "Alliance-safe waypoints and cleaner settlement respawns",
      why: "Waypoint automation could treat an allied tile like a hostile target, and captured SETTLEMENT capitals could leave the defender with an inconsistent fallback settlement.",
      changes: [
        "Waypoint queues now drop allied-owned targets instead of dispatching ATTACK commands.",
        "Captured SETTLEMENT capitals are stripped from the captured tile and moved to the defender's oldest valid owned tile, or respawned on unowned land when no valid owned tile exists.",
        "Players respawn with at least 100 gold so they can rebuild immediately."
      ]
    },
    {
      introducedIn: "2026.06.04.3",
      title: "Observatory range unified to 20 tiles",
      why: "The separate 30-tile cast radius and 10-tile protection field were structurally unsynchronised and confusing. A single 20-tile range covers both roles, grows with tech, and keeps both values provably in sync.",
      changes: [
        "Observatory now has a single 20-tile range for both crystal action casting and the enemy-blocking protection field (was 30 / 10 respectively). Tech and domain bonuses still apply as before — max effective range is 36.",
        "The vision ring has been removed from the map overlay; the one remaining ring is the unified range ring, shown at the actual bonus-adjusted distance.",
        "Crystal menu tab no longer disappears while abilities are on cooldown — disabled rows are always shown so you can see why.",
        "Cooldown badge on observatory is positioned closer to the building (was floating too high)."
      ]
    },
    {
      introducedIn: "2026.06.04.2",
      title: "Siphon becomes an Observatory pressure field", why: "Siphon was too narrow and overlapped with other single-target disruption; its real limiter is the Observatory cast slot.",
      changes: ["Siphon now costs 15 CRYSTAL, uses a 10-minute Observatory cooldown, lasts 60 minutes, and affects eligible hostile town/resource tiles in a 3x3 area.", "Affected tiles show the existing siphon badge to players with vision, and the old purge action is gone."]
    },
    {
      introducedIn: "2026.06.04.1",
      title: "Siphon gets a 3D drain flourish",
      why: "Siphon applies a long-running sabotage marker, but the cast moment itself had no immediate 3D feedback after targeting a hostile town or resource tile.",
      changes: [
        "Casting Siphon now triggers a one-shot 3D drain sigil over the target tile, with a locking ring, shadow pool, extraction hooks, and rising stolen-yield motes.",
        "The effect is client-only cast feedback and does not add synced persistent state."
      ]
    },
    {
      introducedIn: "2026.06.03.2",
      title: "Survey Sweep becomes hidden-intel pings",
      why: "Survey Sweep overlapped too much with hard map reveal effects. It now gives useful scouting direction without exposing exact terrain or resource types.",
      changes: [
        "Casting Survey Sweep from an active observatory scans a centered 50x50 area and reports only towns plus generic resource sites outside your current vision.",
        "Hidden resource pings do not reveal whether the site is crystal, iron, or supply.",
        "The cast still triggers the one-shot 3D scan flourish, followed by hovering hidden-intel badges for the detected sites."
      ]
    },
    {
      introducedIn: "2026.06.03.1",
      title: "Mustering & The Advance (beta)",
      why: "Direct pool attacks give no tactical readout — muster accumulation makes the build-up visible so defenders can counter-prepare, and slows the pace of border fights to match strategic intent.",
      changes: [
        "Tile menu: 'Stage Muster' on owned land tiles — set HOLD to accumulate, ADVANCE to auto-fire when full",
        "Muster fill bars appear above tiles as manpower accumulates (owner-colored). Outposts act as depot zones that fill at 2× speed.",
        "Forts show a gold garrison bar. Garrison scales defense bonus — attack a fort repeatedly to wear it down before breaking through. Garrison refills from overflow regen when your pool is full.",
        "Barbarian raid: attacking a barb tile costs only a small pool fee, no staging required — great for clearing territory fast.",
        "Manpower HUD chip now shows logistics throughput (→ X/m) alongside your regen rate.",
      ]
    },
    {
      introducedIn: "2026.06.03.1",
      title: "Town food upkeep always visible in tile overview",
      why: "The Town food-upkeep line (\"Town: 🍖 0.30/m\") was disappearing from the tile detail panel for CITY, GREAT_CITY, and METROPOLIS towns when the server snapshot didn't carry the foodUpkeepPerMinute field. The gateway now derives it from population tier instead of trusting the stored field.",
      changes: [
        "Town food-upkeep entry now always appears for TOWN/CITY/GREAT_CITY/METROPOLIS tiers in the tile detail panel.",
        "Values: TOWN 0.10/m, CITY 0.30/m, GREAT_CITY 0.60/m, METROPOLIS 1.00/m — matching the actual food drain.",
        "Settlements correctly show no Town food entry (they don't consume food)."
      ]
    },
    {
      introducedIn: "2026.06.02.9",
      title: "Reveal Empire gets a beacon cast flourish",
      why: "Reveal Empire changes long-running visibility, but the cast moment itself had no 3D feedback when the player selected a hostile tile.",
      changes: [
        "Casting Reveal Empire now launches a one-shot 3D beacon upward from the selected hostile tile, with a light trail, reveal halo, cartography sweep, and rising map-fragment motes.",
        "The effect is client-only feedback and does not add synced persistent state."
      ]
    },
    {
      introducedIn: "2026.06.02.8",
      title: "Unified build pipeline",
      why: "Four separate build messages (BUILD_FORT, BUILD_OBSERVATORY, BUILD_SIEGE_OUTPOST, BUILD_ECONOMIC_STRUCTURE) each had their own handler, costing tables, and validation paths — making it hard to add new structures, inconsistent between upgrade tiers, and the source of the LIGHT_OUTPOST type-lie.",
      changes: [
        "All build actions now use a single BUILD_STRUCTURE message with a structureType field.",
        "Build menus and queuing are unchanged — this is a behind-the-scenes consolidation.",
        "No gameplay changes."
      ]
    },
    {
      introducedIn: "2026.06.02.7",
      title: "Food economy rework",
      why: "Food was a near-dead currency — once every town was fed, all surplus was silently discarded with no way to spend it. Fish and farm were mechanically identical despite their different strategic themes.",
      changes: [
        "Fish tiles now have zero yield cap — fish food must be used as produced or it is lost.",
        "Town population growth now costs food per tick on top of building/town upkeep.",
        "Town tier upgrades (CITY, GREAT_CITY, METROPOLIS) are now manual commands that cost food instead of happening automatically.",
        "The tier upgrade button shows in the town tile menu when population meets the threshold.",
        "Farmstead gives +50% food on farm tiles (fish unaffected). Waterworks is now a radius-support building that boosts all farmstead food within 10 tiles."
      ]
    },
    {
      introducedIn: "2026.06.02.6",
      title: "Unique empire colours + barbarian always grey",
      why: "Players who picked red collided with barbarian tiles (owner id `barbarian-1` missed the `barbarian` grey guard). All 100 palette colours are now curated and server-enforced unique per empire; the 6 suggested swatches are always free; AI empires reserve distinct colours at startup.",
      changes: [
        "Each empire's colour is unique — the gateway rejects duplicates and suggests a nearby-but-distinct alternative.",
        "Barbarian tiles always render grey (#2f3842) in both 2D and 3D regardless of owner id variant.",
        "Suggested colour swatches in the profile picker are always free (no other empire holds them).",
        "AI empires (ai-1..ai-20) are seeded with unique, stable colours from the curated 100-colour palette.",
      ],
    },
    {
      introducedIn: "2026.06.02.5",
      title: "Aether Bridge crossing now works for expand and attack",
      why: "Tapping a tile bridged by Aether Bridge did nothing — the client never sent the command and the sim always rejected it as non-adjacent.",
      changes: [
        "Expand and attack actions now resolve across an active Aether Bridge from the bridge origin to the bridged tile.",
        "The client now picks the correct bridge origin so the expand/attack command is dispatched instead of silently dropped."
      ]
    },
    {
      introducedIn: "2026.06.02.4",
      title: "Domain picks no longer send stale mobile taps",
      why: "On mobile, an already-chosen domain detail could still expose a tappable action, sending a duplicate domain pick that the server rejected as requirements not met.",
      changes: [
        "Already-chosen domain detail actions are disabled instead of sending another CHOOSE_DOMAIN command.",
        "The client now blocks owned, unavailable-tier, and unmet-requirement domain picks locally with a clear activity message before they reach the server."
      ]
    },
    {
      introducedIn: "2026.06.02.3",
      title: "Reveal Empire Stats now opens an intel dossier",
      why: "The ability returned useful empire numbers, but the client only posted a short feed line that was easy to miss and did not feel like a real intelligence report.",
      changes: [
        "Reveal Empire Stats now opens a civilization-style intel dossier popup with economy, territory, town, manpower, tech, gold, and strategic stockpile details.",
        "Casting the ability on a hostile tile now triggers a one-shot 3D scan-and-dossier extraction flourish on that selected tile."
      ]
    },
    {
      introducedIn: "2026.06.02.2",
      title: "Domain tiers advance after your chosen doctrine",
      why: "Tier 2 domain cards could still say Tier 1 needed to be unlocked first after the player had already chosen a Tier 1 domain, because the UI treated only currently tech-eligible domains as the open tier.",
      changes: [
        "After choosing a Tier 1 domain, the domain panel now shows Tier 2 as the active tier.",
        "Tier 2 cards now show the real blocker, such as a missing required tech or resources, instead of the stale Tier 1 prerequisite message."
      ]
    },
    {
      introducedIn: "2026.06.02.1",
      title: "Capture pop-loss labels now disappear cleanly",
      why: "The floating negative-population label could appear to hang in the air after a capture, even though its job is only to call out the population loss once.",
      changes: [
        "The 3D \"-N pop\" label now stays fully readable first, then fades and is removed at the fade endpoint so it does not linger above the town."
      ]
    },
    {
      introducedIn: "2026.06.01.6",
      title: "Attack rejections now surface as popups",
      why: "Errors like NOT_ADJACENT, ATTACK_COOLDOWN, LOCKED, SHIELDED, ALLY_TARGET, BARRIER, and ORIGIN_CUT_OFF were only written to the activity log, which players frequently miss. They now trigger the capture-alert popup so the reason for a blocked action is immediately visible.",
      changes: [
        "NOT_ADJACENT, ATTACK_TARGET_INVALID, ATTACK_COOLDOWN, LOCKED, ALLY_TARGET, SHIELDED, BARRIER, and ORIGIN_CUT_OFF now show the \"Action blocked\" popup in addition to the activity log entry."
      ]
    },
    {
      introducedIn: "2026.06.01.5",
      title: "Retort Transmutation gets a 3D recast flourish",
      why: "Retort Transmutation changes a resource tile, but the 3D map did not show the alchemical cast moment when the player triggered it.",
      changes: [
        "Casting a retort recast now triggers an alchemical transmutation circle, glass retort glow, orbiting motes, target-resource core, and fading ground wash on the selected tile.",
        "The effect is client-only and one-shot, so it provides immediate cast feedback without adding synced persistent state."
      ]
    },
    {
      introducedIn: "2026.06.01.4",
      title: "Aether Lance gets a focused 3D strike",
      why: "Aether Lance is a precise structure-breaking crystal cast, but the 3D map gave no cast feedback when the player fired it.",
      changes: [
        "Casting Aether Lance now triggers a target lock, charging column, needle beam, shock ring, debris burst, and fading afterglow on the target tile.",
        "The effect is client-only and one-shot, so it gives immediate feedback without adding persistent map state."
      ]
    },
    {
      introducedIn: "2026.06.01.3",
      title: "Aether Bridge raises 3D anchor pylons",
      why: "In the 3D map the bridge only had flat painted anchor marks, which read poorly in perspective and made the span feel like a 2D doodle rather than a built structure.",
      changes: [
        "Each end of an active Aether Bridge now raises a brass-and-copper pylon — riveted iron base, twin towers, a turning cog, and a glowing aether core — that stands on the coast in 3D.",
        "The flat anchor glyphs are kept for the 2D map; the 3D map uses the new pylons instead."
      ]
    },
    {
      introducedIn: "2026.06.01.3",
      title: "Observatory crystal-cooldown is now visible",
      why: "After casting a crystal action like Aether Bridge, the source observatory goes on cooldown, but nothing on the map or in the tile menu showed it — so a follow-up cast appeared to silently do nothing.",
      changes: [
        "A floating hourglass badge now hovers over your own active observatory while its crystal-casting cooldown is running.",
        "The tile overview for an active observatory now shows a live \"Crystal casting recharging — ready in MM:SS\" countdown."
      ]
    },
    {
      introducedIn: "2026.06.01.2",
      title: "Shared support tiles can build again",
      why: "Support tiles that touched multiple towns were blocked with 'Support tile touches multiple towns' even when the player owned the land. The block avoided double-counting support effects, but it made valid settled support tiles unusable.",
      changes: [
        "The client now assigns a shared support tile to one deterministic town and keeps the building actions available.",
        "Simulation support and support-structure effects use the same one-town assignment, so one support tile cannot boost multiple towns."
      ]
    },
    {
      introducedIn: "2026.06.01.1",
      title: "Client backs off when the server is busy",
      why: "The gateway now rejects auth with SERVER_BUSY when too many players are connecting at once. Without this change, the client treated SERVER_BUSY as a fatal error and stopped retrying, which made the reconnection cascade worse.",
      changes: [
        "SERVER_BUSY auth errors now flow into the existing reconnect backoff (exponential with jitter), same as SERVER_STARTING.",
        "No new backoff logic — the existing scheduleAuthReconnect path handles the retry spacing."
      ]
    },
    {
      introducedIn: "2026.05.30.3",
      title: "Manpower regen slowdown now uses one runtime source",
      why: "The shared balance constants had been slowed so a settlement takes about 12 hours to refill manpower, but game-domain still exported the old fast per-tier table. That left room for runtime paths and tooling to drift back to pre-slowdown rates.",
      changes: [
        "Simulation now reads manpower cap and regen constants through game-domain, which mirrors the shared balance table instead of keeping a duplicate fast table.",
        "Added a regression test that fails if base regen or any town tier stops taking about 720 minutes to refill its manpower cap."
      ]
    },
    {
      introducedIn: "2026.05.30.3",
      title: "Income multiplier and advanced converter display fixes (PR #440 follow-up)",
      why: "Two regressions from the bootstrap-payload-shrink work. (1) The player's income mod from tech was applied to every tile's yield display — even enemy tiles — so clicking another empire showed inflated yields. (2) Advanced converter structures (ADVANCED_FUR_SYNTHESIZER, ADVANCED_IRONWORKS, ADVANCED_CRYSTAL_SYNTHESIZER) displayed their theoretically-correct higher values (21.6 / 21.6 / 14.4), but the sim currently returns the basic values (18 / 18 / 12) for these structures. The client now matches the sim so displayed yield equals actual production. The sim-side fix will be a separate gameplay PR.",
      changes: [
        "Income multiplier from tech now only applies to tiles owned by the viewer. Enemy tiles display their owner-appropriate yield.",
        "Advanced converter daily output now matches the sim's current behavior (basic values). Will update in lockstep when the sim honors ADVANCED_* constants."
      ]
    },
    {
      introducedIn: "2026.05.30.2",
      title: "Barbarian counter-captures stay settled",
      why: "When a player attack against barbarians failed, the counter-captured origin tile was being converted to barbarian FRONTIER land. That could make the tile blink like cut-off frontier even though barbarian territory should always be settled.",
      changes: [
        "Failed attacks against barbarians now leave the counter-captured player origin as barbarian SETTLED land.",
        "Any stale frontier decay timer on that captured origin is cleared during the ownership change."
      ]
    },
    {
      introducedIn: "2026.05.30.1",
      title: "Smaller initial world payload — faster load times",
      why: "The bootstrap init message was 512KB and growing with the world. Per-tile fields yieldRate and yieldCap were redundant for town tiles (townJson already carries goldPerMinute and cap) and derivable for non-town tiles from static yield tables and tile resource/dock/economicStructure fields. Moving them to client-side derivation shrinks the payload ~30%.",
      changes: [
        "yieldRate and yieldCap are no longer sent in the bootstrap init payload. The client derives them from the tile's townJson, resource, dockId, and economicStructure fields.",
        "Town tiles still carry goldPerMinute and cap inside townJson — no loss of accuracy.",
        "Gateway tile-detail endpoint still computes and returns yieldRate/yieldCap for live tile detail fetches."
      ]
    },
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
