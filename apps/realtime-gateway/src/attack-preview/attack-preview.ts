import { BREAKTHROUGH_ENABLED, buildFrontierCombatPreview, scanOutpostMult, type OutpostAuraTileFacts } from "@border-empires/shared";
import { resolveFrontierCombatMultipliers } from "@border-empires/game-domain";
import type { PlayerSubscriptionDock } from "@border-empires/sim-protocol";

import { isFrontierAdjacent } from "../../../simulation/src/frontier-adjacency/frontier-adjacency.js";

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
  breachShockUntil?: number | undefined;
};

const previewTileKey = (x: number, y: number): string => `${x},${y}`;

type PreviewTileWithAura = PreviewTile & OutpostAuraTileFacts;

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
const buildPreviewTileMap = (tiles: PreviewTile[]): Map<string, PreviewTileWithAura> => {
  const map = new Map<string, PreviewTileWithAura>();
  for (const tile of tiles) {
    const siegeOutpost = parseStructureJson<{ ownerId?: string; status?: string }>(tile.siegeOutpostJson);
    const economicStructure = parseStructureJson<{ ownerId?: string; type?: string; status?: string }>(tile.economicStructureJson);
    map.set(previewTileKey(tile.x, tile.y), {
      ...tile,
      ...(siegeOutpost ? { siegeOutpost } : {}),
      ...(economicStructure ? { economicStructure } : {})
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
  getPlayerTechDomainIds?: (playerId: string) => { techIds: readonly string[]; domainIds: readonly string[] } | undefined
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
  const preview = buildFrontierCombatPreview(target, {
    attackerOutpostMult,
    defenderOwnerId: target.ownerId,
    ...(techModifiers ?? {}), ...(BREAKTHROUGH_ENABLED ? { nowMs: Date.now() } : {}),
  });
  return {
    ...responseBase,
    valid: true,
    winChance: preview.winChance,
    atkEff: preview.atkEff,
    defEff: preview.defEff,
    defMult: preview.defMult,
    atkMult: preview.atkMult
  };
};
