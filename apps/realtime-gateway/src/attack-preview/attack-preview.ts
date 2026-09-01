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

export const attackPreviewResult = (
  playerId: string,
  tiles: PreviewTile[] | undefined,
  docks: PlayerSubscriptionDock[] | undefined,
  message: { fromX: number; fromY: number; toX: number; toY: number; requestId?: string | undefined },
  attackerTechIds?: readonly string[],
  attackerDomainIds?: readonly string[],
  getPlayerTechDomainIds?: (playerId: string) => { techIds: readonly string[]; domainIds: readonly string[] } | undefined,
  getPlayerFactoryCounts?: (playerId: string) => { titanium: number; umbrite: number } | undefined
): Record<string, unknown> => {
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
  const defenderPlayerData = target.ownerId && getPlayerTechDomainIds ? getPlayerTechDomainIds(target.ownerId) : undefined;
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
  const attackerFactoryCounts = getPlayerFactoryCounts?.(playerId) ?? weaponsFactoryCountsForPlayer(playerId, tileMap.values());
  const defenderFactoryCounts = target.ownerId
    ? getPlayerFactoryCounts?.(target.ownerId) ?? weaponsFactoryCountsForPlayer(target.ownerId, tileMap.values())
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

type SnapshotLookup = (playerId: string) => { tiles?: PreviewTile[]; player?: { techIds: readonly string[]; domainIds: readonly string[] } } | undefined;

// Both callbacks below look a player up by their OWN subscription snapshot
// rather than reusing the requester's tileMap, so tech/factory data stays
// authoritative even when the requester's current vision doesn't cover the
// looked-up player's territory (e.g. an ex-ally whose shared vision just
// retreated — see attackPreviewResult's defenderFactoryCounts doc comment).
export const makeGetPlayerTechDomainIds = (snapshotForPlayer: SnapshotLookup) => (pid: string) => {
  const ps = snapshotForPlayer(pid);
  return ps?.player ? { techIds: ps.player.techIds, domainIds: ps.player.domainIds } : undefined;
};

export const makeGetPlayerFactoryCounts = (snapshotForPlayer: SnapshotLookup) => (pid: string) => {
  const ps = snapshotForPlayer(pid);
  return ps?.tiles ? weaponsFactoryCountsForPlayer(pid, buildPreviewTileMap(ps.tiles).values()) : undefined;
};
