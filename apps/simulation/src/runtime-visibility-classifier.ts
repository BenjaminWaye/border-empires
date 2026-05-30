import { VISION_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { DockRouteDefinition } from "./dock-network.js";
import { collectLinkedDockRevealKeysForOwners } from "./dock-network.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { simulationTileKey } from "./seed-state.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge.js";
import type { LockRecord, RuntimePlayer } from "./runtime-types.js";
import type { DomainTileState } from "@border-empires/game-domain";

export type RuntimeVisibilityClassification = {
  radiusSelfKeys: Set<string>;
  radiusAllyKeys: Map<string, Set<string>>;
  lockOriginKeys: Set<string>;
  dockRevealKeys: Set<string>;
  lockTargetOnlyKeys: Set<string>;
  fullVisionKeys: Set<string>;
  visibleKeys: Set<string>;
  allyAndSelfIds: Set<string>;
};

export const classifyVisibilityForPlayer = (input: {
  playerId: string;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  docks: readonly DockRouteDefinition[];
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  applyManpowerRegen: (player: RuntimePlayer) => void;
}): RuntimeVisibilityClassification => {
  const keyFor = (x: number, y: number): string => simulationTileKey(((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH, ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT);
  const parseKey = (tileKey: string): { x: number; y: number } | undefined => {
    const [rawX, rawY] = tileKey.split(",");
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    return { x, y };
  };
  const radiusSelfKeys = new Set<string>();
  const radiusAllyKeys = new Map<string, Set<string>>();
  const lockOriginKeys = new Set<string>();
  const dockRevealKeys = new Set<string>();
  const fullVisionKeys = new Set<string>();
  const addVision = (
    territoryTileKeys: Iterable<string>,
    vision: number,
    visionRadiusBonus: number,
    sink: Set<string>
  ): void => {
    const radius = Math.max(1, Math.floor(VISION_RADIUS * vision) + visionRadiusBonus);
    for (const tileKey of territoryTileKeys) {
      const coords = parseKey(tileKey);
      if (!coords) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const wrapped = keyFor(coords.x + dx, coords.y + dy);
          sink.add(wrapped);
          fullVisionKeys.add(wrapped);
        }
      }
    }
  };

  const primaryPlayer = input.players.get(input.playerId);
  if (primaryPlayer) {
    input.applyManpowerRegen(primaryPlayer);
    const primarySummary = input.summaryForPlayer(input.playerId);
    addVision(primarySummary.territoryTileKeys, primaryPlayer.mods?.vision ?? 1, visionRadiusBonusForPlayer(primaryPlayer), radiusSelfKeys);
    for (const allyId of primaryPlayer.allies) {
      const ally = input.players.get(allyId);
      if (!ally) continue;
      input.applyManpowerRegen(ally);
      const allySink = new Set<string>();
      addVision(input.summaryForPlayer(allyId).territoryTileKeys, ally.mods?.vision ?? 1, visionRadiusBonusForPlayer(ally), allySink);
      radiusAllyKeys.set(allyId, allySink);
    }
  } else {
    const territoryTileKeys: string[] = [];
    for (const [tileKey, tile] of input.tiles) {
      if (tile.ownerId === input.playerId) territoryTileKeys.push(tileKey);
    }
    if (territoryTileKeys.length > 0) addVision(territoryTileKeys, 1, 0, radiusSelfKeys);
  }
  for (const lock of input.locksByTile.values()) {
    if (lock.playerId !== input.playerId) continue;
    lockOriginKeys.add(lock.originKey);
    fullVisionKeys.add(lock.originKey);
  }
  if (primaryPlayer) {
    const visibilityOwnerIds = new Set<string>([input.playerId, ...primaryPlayer.allies]);
    for (const revealKey of collectLinkedDockRevealKeysForOwners(
      visibilityOwnerIds,
      input.docks,
      (tileKey) => {
        const tile = input.tiles.get(tileKey);
        return tile?.ownershipState === "SETTLED" ? tile.ownerId : undefined;
      },
      input.dockLinksByDockTileKey,
      WORLD_WIDTH,
      WORLD_HEIGHT
    )) {
      dockRevealKeys.add(revealKey);
      fullVisionKeys.add(revealKey);
    }
  }

  const lockTargetOnlyKeys = new Set<string>();
  for (const lock of input.locksByTile.values()) {
    if (lock.playerId !== input.playerId) continue;
    if (fullVisionKeys.has(lock.targetKey)) continue;
    lockTargetOnlyKeys.add(lock.targetKey);
  }

  const allyAndSelfIds = new Set<string>([input.playerId, ...(primaryPlayer?.allies ?? [])]);
  const visibleKeys = new Set<string>([...fullVisionKeys, ...lockTargetOnlyKeys]);

  return {
    radiusSelfKeys,
    radiusAllyKeys,
    lockOriginKeys,
    dockRevealKeys,
    lockTargetOnlyKeys,
    fullVisionKeys,
    visibleKeys,
    allyAndSelfIds
  };
};
