import {
  BREAKTHROUGH_ENABLED,
  buildFrontierCombatPreview,
  scanOutpostMult,
  NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT,
  noWarIndustryLabel,
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING,
  WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING,
  type FortVariant,
  type OutpostAuraTileFacts
} from "@border-empires/shared";
import { resolveFrontierCombatMultipliers } from "@border-empires/game-domain";
import type { PlayerSubscriptionDock } from "@border-empires/sim-protocol";

import { isFrontierAdjacent } from "../../../simulation/src/frontier-adjacency/frontier-adjacency.js";
import { weaponsFactoryCountsForPlayer } from "../../../simulation/src/tech-domain-bridge/weapons-factory-mod-breakdown.js";

type PreviewTile = {
  x: number;
  y: number;
  terrain?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  townType?: string | undefined;
  economicStructureJson?: string | undefined;
  siegeOutpostJson?: string | undefined;
  fortJson?: string | undefined;
  breachShockUntil?: number | undefined;
};

const previewTileKey = (x: number, y: number): string => `${x},${y}`;

type PreviewTileWithAura = PreviewTile & OutpostAuraTileFacts & {
  fort?: { ownerId?: string | undefined; status?: string | undefined; variant?: FortVariant | undefined } | undefined;
};

const parseStructureJson = <T>(json: string | undefined): T | undefined => {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

// Builds a single tile map keyed by "x,y" that also carries each tile's
// JSON-decoded outpost structures. Parsing happens once per preview, not
// once per scan-cell, so the 5x5 aura sweep does only Map.get() work.
export const buildPreviewTileMap = (tiles: PreviewTile[]): Map<string, PreviewTileWithAura> => {
  const map = new Map<string, PreviewTileWithAura>();
  for (const tile of tiles) {
    const siegeOutpost = parseStructureJson<{ ownerId?: string; status?: string }>(tile.siegeOutpostJson);
    const economicStructure = parseStructureJson<{ ownerId?: string; type?: string; status?: string }>(tile.economicStructureJson);
    const fort = parseStructureJson<{ ownerId?: string; status?: string; variant?: FortVariant }>(tile.fortJson);
    map.set(previewTileKey(tile.x, tile.y), {
      ...tile,
      ...(siegeOutpost ? { siegeOutpost } : {}),
      ...(economicStructure ? { economicStructure } : {}),
      ...(fort ? { fort } : {})
    });
  }
  return map;
};

const previewDockLink = (fromX: number, fromY: number, toX: number, toY: number, docks: PlayerSubscriptionDock[] | undefined): boolean => {
  if (!docks) return false;
  const dockById = new Map(docks.map((d) => [d.dockId, d] as const));
  const dockByTileKey = new Map(docks.map((d) => [d.tileKey, d] as const));
  const fromDock = dockByTileKey.get(`${fromX},${fromY}`);
  if (!fromDock) return false;
  const linkedDockIds = fromDock.connectedDockIds?.length ? fromDock.connectedDockIds : fromDock.pairedDockId ? [fromDock.pairedDockId] : [];
  const toKey = `${toX},${toY}`;
  return linkedDockIds.some((linkedId) => {
    const linked = dockById.get(linkedId);
    return linked?.tileKey === toKey;
  });
};

export const attackPreviewResult = async (
  playerId: string,
  tiles: PreviewTile[] | undefined,
  docks: PlayerSubscriptionDock[] | undefined,
  message: { fromX: number; fromY: number; toX: number; toY: number; requestId?: string | undefined },
  attackerTechIds?: readonly string[],
  attackerDomainIds?: readonly string[],
  getPlayerTechDomainIds?: (playerId: string) => Promise<{ techIds: readonly string[]; domainIds: readonly string[] } | undefined>,
  getPlayerFactoryCounts?: (playerId: string) => Promise<{ titanium: number; umbrite: number } | undefined>
): Promise<Record<string, unknown>> => {
  const from = { x: message.fromX, y: message.fromY };
  const to = { x: message.toX, y: message.toY };
  const responseBase = { type: "ATTACK_PREVIEW_RESULT", from, to, ...(message.requestId ? { requestId: message.requestId } : {}) };
  if (!tiles) {
    return { ...responseBase, valid: false, reason: "preview unavailable" };
  }
  const tileMap = buildPreviewTileMap(tiles);
  const origin = tileMap.get(previewTileKey(from.x, from.y));
  const target = tileMap.get(previewTileKey(to.x, to.y));
  if (!origin || origin.ownerId !== playerId) {
    return { ...responseBase, valid: false, reason: "origin not owned" };
  }
  if (!target) {
    return { ...responseBase, valid: false, reason: "target not visible" };
  }
  if (!target.ownerId || target.ownerId === playerId) {
    return { ...responseBase, valid: false, reason: "target not hostile" };
  }
  if (!isFrontierAdjacent(from.x, from.y, to.x, to.y) && !previewDockLink(from.x, from.y, to.x, to.y, docks)) {
    return { ...responseBase, valid: false, reason: "target not adjacent" };
  }
  const attackerOutpostMult = scanOutpostMult(playerId, to.x, to.y, (x: number, y: number) => tileMap.get(previewTileKey(x, y)));
  const defenderPlayerData = target.ownerId && getPlayerTechDomainIds ? await getPlayerTechDomainIds(target.ownerId) : undefined;
  const techModifiers = attackerTechIds
    ? resolveFrontierCombatMultipliers(
        attackerTechIds,
        attackerDomainIds,
        defenderPlayerData?.techIds,
        defenderPlayerData?.domainIds,
      )
    : undefined;
  // Weapons Workshop count only ever needs to look at the previewing
  // player's own tiles (attacker) or the target's tiles the attacker can
  // currently see (defender) — it isn't used for a "missing building"
  // penalty, so a subscription-scoped scan is fine here.
  const ownedWeaponsWorkshopCount = (ownerId: string): number => {
    let count = 0;
    for (const tile of tileMap.values()) {
      if (tile.ownerId === ownerId && tile.economicStructure?.status === "active" && tile.economicStructure.type === "WEAPONS_WORKSHOP") count += 1;
    }
    return count;
  };
  // Titanium/Umbrite Weapons Factory counts drive the "missing war
  // industry" +100% vulnerability penalty, so they must be authoritative
  // regardless of the attacker's current vision of the target — otherwise
  // breaking an alliance (which immediately drops shared ally vision) makes
  // the preview claim the target is missing factories it actually has, even
  // though the real combat resolver (runtime-weapons-factory-mults.ts) uses
  // the vision-independent owned-structure index and gets it right. Use the
  // target's own subscription snapshot (like getPlayerTechDomainIds above)
  // instead of scanning the attacker's vision-limited tileMap.
  const attackerFactoryCounts = (getPlayerFactoryCounts ? await getPlayerFactoryCounts(playerId) : undefined)
    ?? weaponsFactoryCountsForPlayer(playerId, tileMap.values());
  const defenderFactoryCounts = target.ownerId
    ? (getPlayerFactoryCounts ? await getPlayerFactoryCounts(target.ownerId) : undefined)
      ?? weaponsFactoryCountsForPlayer(target.ownerId, tileMap.values())
    : { titanium: 0, umbrite: 0 };
  const defenderHasWarIndustry = defenderFactoryCounts.titanium > 0 && defenderFactoryCounts.umbrite > 0;
  const attackerHasWarIndustry = attackerFactoryCounts.titanium > 0 && attackerFactoryCounts.umbrite > 0;
  const factoryModifiers = {
    weaponsWorkshopAttackMult: 1 + ownedWeaponsWorkshopCount(playerId) * WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING,
    weaponsWorkshopDefenseMult: 1 + (target.ownerId ? ownedWeaponsWorkshopCount(target.ownerId) : 0) * WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING,
    titaniumWeaponsFactoryAttackMult: 1 + attackerFactoryCounts.titanium * TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
    titaniumWeaponsFactoryDefenseMult: 1 + defenderFactoryCounts.titanium * TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
    umbriteWeaponsFactoryAttackMult: 1 + attackerFactoryCounts.umbrite * UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
    umbriteWeaponsFactoryDefenseMult: 1 + defenderFactoryCounts.umbrite * UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
    noWarIndustryVulnerabilityMult: defenderHasWarIndustry ? 1 : NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT,
    noWarIndustryVulnerabilityLabel: noWarIndustryLabel("Target", defenderFactoryCounts.titanium > 0, defenderFactoryCounts.umbrite > 0),
    noWarIndustryDefenseVulnerabilityMult: attackerHasWarIndustry ? 1 : NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT,
    noWarIndustryDefenseVulnerabilityLabel: noWarIndustryLabel("Attacker", attackerFactoryCounts.titanium > 0, attackerFactoryCounts.umbrite > 0)
  };
  const targetHasActiveFort = Boolean(target.fort && target.fort.status === "active" && target.fort.ownerId === target.ownerId);
  const preview = buildFrontierCombatPreview(
    { ...target, fortVariant: targetHasActiveFort ? target.fort?.variant : undefined },
    {
      attackerOutpostMult,
      defenderOwnerId: target.ownerId,
      ...factoryModifiers,
      ...(techModifiers ?? {}), ...(BREAKTHROUGH_ENABLED ? { nowMs: Date.now() } : {}),
    }
  );
  return {
    ...responseBase,
    valid: true,
    winChance: preview.winChance,
    atkEff: preview.atkEff,
    defEff: preview.defEff,
    defMult: preview.defMult,
    atkMult: preview.atkMult,
    attacker: preview.attacker,
    defender: preview.defender
  };
};

type SnapshotLookup = (playerId: string) => {
  tiles?: PreviewTile[];
  player?: {
    techIds: readonly string[];
    domainIds: readonly string[];
    weaponsFactoryCounts?: { titanium: number; umbrite: number };
  };
} | undefined;

export type PlayerCombatSummaryLookup = (playerId: string) => Promise<{
  techIds: readonly string[];
  domainIds: readonly string[];
  weaponsFactoryCounts: { titanium: number; umbrite: number };
} | undefined>;

// makeGetPlayerTechDomainIds and makeGetPlayerFactoryCounts each
// independently fall back to this lookup for the same player when they
// have no cached snapshot (e.g. they're offline), so a single attack
// preview against such a player would otherwise fire the same
// GetPlayerCombatSummary RPC twice (once per factory). Callers should wrap
// the raw lookup with this per-request, so both factories share one call.
export const memoizePlayerCombatSummaryLookup = (getPlayerCombatSummary: PlayerCombatSummaryLookup): PlayerCombatSummaryLookup => {
  const cache = new Map<string, ReturnType<PlayerCombatSummaryLookup>>();
  return (pid: string) => {
    const cached = cache.get(pid);
    if (cached) return cached;
    const result = getPlayerCombatSummary(pid);
    cache.set(pid, result);
    return result;
  };
};

// Shared by both factories below so a GetPlayerCombatSummary RPC failure
// (e.g. simulation unreachable) degrades the preview to its pre-fallback
// behavior instead of rejecting the whole request.
const safeGetPlayerCombatSummary = async (getPlayerCombatSummary: PlayerCombatSummaryLookup | undefined, pid: string) => {
  try {
    return await getPlayerCombatSummary?.(pid);
  } catch (error) {
    console.warn(`[attack-preview] GetPlayerCombatSummary fallback failed for ${pid}:`, error instanceof Error ? error.message : error);
    return undefined;
  }
};

// Both callbacks below look a player up by their OWN subscription snapshot
// rather than reusing the requester's tileMap, so tech/factory data stays
// authoritative even when the requester's current vision doesn't cover the
// looked-up player's territory (e.g. an ex-ally whose shared vision just
// retreated — see attackPreviewResult's defenderFactoryCounts doc comment).
//
// A player has no cached subscription snapshot at all while they're
// offline (playerSubscriptions evicts it on socket disconnect), so both
// factories fall back to getPlayerCombatSummary — a lightweight
// GetPlayerCombatSummary RPC to the simulation (see
// player-combat-summary-snapshot.ts) — instead of returning undefined,
// which used to make attackPreviewResult fall back further to scanning the
// REQUESTER's vision-limited tileMap. That reproduced the same false
// "missing weapons factory" bonus PR #1745 fixed for the ex-ally case,
// just triggered by "target is offline" instead.
export const makeGetPlayerTechDomainIds = (snapshotForPlayer: SnapshotLookup, getPlayerCombatSummary?: PlayerCombatSummaryLookup) => async (pid: string) => {
  const ps = snapshotForPlayer(pid);
  if (ps?.player) return { techIds: ps.player.techIds, domainIds: ps.player.domainIds };
  return safeGetPlayerCombatSummary(getPlayerCombatSummary, pid);
};

// player.weaponsFactoryCounts is already computed once per snapshot build
// from the runtime's full (not vision-filtered) tile set — see
// player-snapshot.ts's weaponsFactoryCounts — so this is an O(1) field read,
// not a re-scan. Falls back to scanning ps.tiles for older/partial
// snapshots that predate this field (e.g. in tests), then to
// getPlayerCombatSummary (see doc comment above) when there is no cached
// snapshot for the player at all.
export const makeGetPlayerFactoryCounts = (snapshotForPlayer: SnapshotLookup, getPlayerCombatSummary?: PlayerCombatSummaryLookup) => async (pid: string) => {
  const ps = snapshotForPlayer(pid);
  if (ps?.player?.weaponsFactoryCounts) return ps.player.weaponsFactoryCounts;
  if (ps?.tiles) return weaponsFactoryCountsForPlayer(pid, buildPreviewTileMap(ps.tiles).values());
  const combatSummary = await safeGetPlayerCombatSummary(getPlayerCombatSummary, pid);
  return combatSummary?.weaponsFactoryCounts;
};

// Assembles the ATTACK_PREVIEW response for the gateway's message handler:
// wires up the (memoized, so the two factories above share one
// GetPlayerCombatSummary call per target) combat-summary fallback and calls
// attackPreviewResult. Extracted so the handler itself stays a one-liner.
export const buildAttackPreviewResponse = (
  playerId: string,
  previewSnapshot: {
    tiles?: PreviewTile[];
    docks?: PlayerSubscriptionDock[];
    player?: { techIds: readonly string[]; domainIds: readonly string[] };
  } | undefined,
  snapshotForPlayer: SnapshotLookup,
  getPlayerCombatSummaryRaw: PlayerCombatSummaryLookup,
  message: { fromX: number; fromY: number; toX: number; toY: number; requestId?: string | undefined }
): Promise<Record<string, unknown>> => {
  const getPlayerCombatSummary = memoizePlayerCombatSummaryLookup(getPlayerCombatSummaryRaw);
  return attackPreviewResult(
    playerId,
    previewSnapshot?.tiles,
    previewSnapshot?.docks,
    message,
    previewSnapshot?.player?.techIds,
    previewSnapshot?.player?.domainIds,
    makeGetPlayerTechDomainIds(snapshotForPlayer, getPlayerCombatSummary),
    makeGetPlayerFactoryCounts(snapshotForPlayer, getPlayerCombatSummary)
  );
};
