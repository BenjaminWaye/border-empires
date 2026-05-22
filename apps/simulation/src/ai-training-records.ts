import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { AutomationPlannerDiagnostic, AutomationPlannerTile } from "./automation-command-planner.js";
import type { PlannerDockView, PlannerPlayerView } from "./planner-world-view.js";

export type AiTrainingTileRecord = Pick<
  AutomationPlannerTile,
  | "x"
  | "y"
  | "terrain"
  | "ownerId"
  | "ownershipState"
  | "resource"
  | "dockId"
  | "town"
  | "fort"
  | "observatory"
  | "siegeOutpost"
  | "economicStructure"
>;

export type AiTrainingRecord = {
  recordId: string;
  source: {
    runtime: "rewrite-simulation";
    playerId: string;
    issuedAt: number;
    clientSeq: number;
    sessionPrefix: string;
  };
  plannerState: {
    player: {
      id: string;
      points: number;
      manpower: number;
      techIds?: readonly string[];
      strategicResources?: Partial<Record<string, number>>;
      settledTileCount?: number;
      townCount?: number;
      incomePerMinute?: number;
      hasActiveLock: boolean;
      activeDevelopmentProcessCount: number;
    };
    tiles: {
      owned: AiTrainingTileRecord[];
      frontier: AiTrainingTileRecord[];
      hotFrontier: AiTrainingTileRecord[];
      strategicFrontier: AiTrainingTileRecord[];
      buildCandidates: AiTrainingTileRecord[];
    };
    tileCounts: {
      owned: number;
      frontier: number;
      hotFrontier: number;
      strategicFrontier: number;
      buildCandidates: number;
    };
    tileSampleLimits: {
      owned: number;
      frontier: number;
      hotFrontier: number;
      strategicFrontier: number;
      buildCandidates: number;
    };
    docks?: PlannerDockView[];
  };
  chosenAction: {
    type: string | null;
    payload: Record<string, unknown> | null;
  };
  outcome: null;
  notes: {
    diagnostic: AutomationPlannerDiagnostic;
    pendingSettlementTileKeys: string[];
  };
};

const DEFAULT_TILE_SAMPLE_LIMITS = {
  owned: 24,
  frontier: 48,
  hotFrontier: 48,
  strategicFrontier: 48,
  buildCandidates: 32
} as const;

const tileKey = (tile: Pick<AutomationPlannerTile, "x" | "y">): string => `${tile.x},${tile.y}`;

const parseTileSampleLimit = (envName: string, fallback: number): number => {
  const raw = process.env[envName];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${envName} must be a positive integer`);
  }
  return parsed;
};

const getTileSampleLimits = () => {
  const globalLimit = process.env.SIMULATION_AI_TRAINING_TILE_SAMPLE_LIMIT?.trim()
    ? parseTileSampleLimit("SIMULATION_AI_TRAINING_TILE_SAMPLE_LIMIT", DEFAULT_TILE_SAMPLE_LIMITS.frontier)
    : undefined;
  return {
    owned: parseTileSampleLimit(
      "SIMULATION_AI_TRAINING_OWNED_TILE_LIMIT",
      globalLimit ?? DEFAULT_TILE_SAMPLE_LIMITS.owned
    ),
    frontier: parseTileSampleLimit(
      "SIMULATION_AI_TRAINING_FRONTIER_TILE_LIMIT",
      globalLimit ?? DEFAULT_TILE_SAMPLE_LIMITS.frontier
    ),
    hotFrontier: parseTileSampleLimit(
      "SIMULATION_AI_TRAINING_HOT_FRONTIER_TILE_LIMIT",
      globalLimit ?? DEFAULT_TILE_SAMPLE_LIMITS.hotFrontier
    ),
    strategicFrontier: parseTileSampleLimit(
      "SIMULATION_AI_TRAINING_STRATEGIC_FRONTIER_TILE_LIMIT",
      globalLimit ?? DEFAULT_TILE_SAMPLE_LIMITS.strategicFrontier
    ),
    buildCandidates: parseTileSampleLimit(
      "SIMULATION_AI_TRAINING_BUILD_CANDIDATE_TILE_LIMIT",
      globalLimit ?? DEFAULT_TILE_SAMPLE_LIMITS.buildCandidates
    )
  };
};

const serializeTile = (tile: AutomationPlannerTile): AiTrainingTileRecord => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.town ? { town: { ...tile.town } } : {}),
  ...(tile.fort ? { fort: { ...tile.fort } } : {}),
  ...(tile.observatory ? { observatory: { ...tile.observatory } } : {}),
  ...(tile.siegeOutpost ? { siegeOutpost: { ...tile.siegeOutpost } } : {}),
  ...(tile.economicStructure ? { economicStructure: { ...tile.economicStructure } } : {})
});

const parseCommandPayload = (command: CommandEnvelope | undefined): Record<string, unknown> | null => {
  if (!command) return null;
  try {
    return JSON.parse(command.payloadJson) as Record<string, unknown>;
  } catch {
    return { rawPayloadJson: command.payloadJson };
  }
};

const numberValue = (payload: Record<string, unknown> | null, key: string): number | undefined => {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const commandTileKeys = (payload: Record<string, unknown> | null): ReadonlySet<string> => {
  const keys = new Set<string>();
  const add = (x: number | undefined, y: number | undefined): void => {
    if (x !== undefined && y !== undefined) keys.add(`${x},${y}`);
  };
  add(numberValue(payload, "x"), numberValue(payload, "y"));
  add(numberValue(payload, "fromX"), numberValue(payload, "fromY"));
  add(numberValue(payload, "toX"), numberValue(payload, "toY"));
  return keys;
};

const hasStructure = (tile: AutomationPlannerTile): boolean =>
  Boolean(tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure);

const tilePriority = (
  tile: AutomationPlannerTile,
  importantTileKeys: ReadonlySet<string>,
  pendingSettlementTileKeys: ReadonlySet<string>
): number => {
  const key = tileKey(tile);
  if (importantTileKeys.has(key)) return 0;
  if (pendingSettlementTileKeys.has(key)) return 1;
  if (tile.town) return 2;
  if (tile.resource) return 3;
  if (tile.dockId || hasStructure(tile)) return 4;
  if (tile.ownershipState === "SETTLED") return 5;
  return 6;
};

const sampleTiles = (
  tiles: readonly AutomationPlannerTile[],
  limit: number,
  importantTileKeys: ReadonlySet<string>,
  pendingSettlementTileKeys: ReadonlySet<string>
): AiTrainingTileRecord[] =>
  [...tiles]
    .sort((left, right) => {
      const priorityDelta =
        tilePriority(left, importantTileKeys, pendingSettlementTileKeys) -
        tilePriority(right, importantTileKeys, pendingSettlementTileKeys);
      if (priorityDelta !== 0) return priorityDelta;
      if (left.y !== right.y) return left.y - right.y;
      return left.x - right.x;
    })
    .slice(0, limit)
    .map(serializeTile);

export const buildAiTrainingRecord = (input: {
  player: PlannerPlayerView;
  issuedAt: number;
  clientSeq: number;
  ownedTiles: readonly AutomationPlannerTile[];
  frontierTiles: readonly AutomationPlannerTile[];
  hotFrontierTiles: readonly AutomationPlannerTile[];
  strategicFrontierTiles: readonly AutomationPlannerTile[];
  buildCandidateTiles: readonly AutomationPlannerTile[];
  pendingSettlementTileKeys: ReadonlySet<string>;
  docks?: readonly PlannerDockView[];
  command?: CommandEnvelope;
  diagnostic: AutomationPlannerDiagnostic;
}): AiTrainingRecord => {
  const payload = parseCommandPayload(input.command);
  const importantTileKeys = commandTileKeys(payload);
  const tileSampleLimits = getTileSampleLimits();

  return {
    recordId: `rewrite:${input.player.id}:${input.clientSeq}:${input.issuedAt}`,
    source: {
      runtime: "rewrite-simulation",
      playerId: input.player.id,
      issuedAt: input.issuedAt,
      clientSeq: input.clientSeq,
      sessionPrefix: input.diagnostic.sessionPrefix
    },
    plannerState: {
      player: {
        id: input.player.id,
        points: input.player.points,
        manpower: input.player.manpower,
        ...(input.player.techIds?.length ? { techIds: [...input.player.techIds] } : {}),
        ...(input.player.strategicResources ? { strategicResources: { ...input.player.strategicResources } } : {}),
        ...(typeof input.player.settledTileCount === "number" ? { settledTileCount: input.player.settledTileCount } : {}),
        ...(typeof input.player.townCount === "number" ? { townCount: input.player.townCount } : {}),
        ...(typeof input.player.incomePerMinute === "number" ? { incomePerMinute: input.player.incomePerMinute } : {}),
        hasActiveLock: input.player.hasActiveLock,
        activeDevelopmentProcessCount: input.player.activeDevelopmentProcessCount
      },
      tiles: {
        owned: sampleTiles(
          input.ownedTiles,
          tileSampleLimits.owned,
          importantTileKeys,
          input.pendingSettlementTileKeys
        ),
        frontier: sampleTiles(
          input.frontierTiles,
          tileSampleLimits.frontier,
          importantTileKeys,
          input.pendingSettlementTileKeys
        ),
        hotFrontier: sampleTiles(
          input.hotFrontierTiles,
          tileSampleLimits.hotFrontier,
          importantTileKeys,
          input.pendingSettlementTileKeys
        ),
        strategicFrontier: sampleTiles(
          input.strategicFrontierTiles,
          tileSampleLimits.strategicFrontier,
          importantTileKeys,
          input.pendingSettlementTileKeys
        ),
        buildCandidates: sampleTiles(
          input.buildCandidateTiles,
          tileSampleLimits.buildCandidates,
          importantTileKeys,
          input.pendingSettlementTileKeys
        )
      },
      tileCounts: {
        owned: input.ownedTiles.length,
        frontier: input.frontierTiles.length,
        hotFrontier: input.hotFrontierTiles.length,
        strategicFrontier: input.strategicFrontierTiles.length,
        buildCandidates: input.buildCandidateTiles.length
      },
      tileSampleLimits,
      ...(input.docks?.length
        ? {
            docks: input.docks.map((dock) => ({
              ...dock,
              ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
            }))
          }
        : {})
    },
    chosenAction: {
      type: input.command?.type ?? null,
      payload
    },
    outcome: null,
    notes: {
      diagnostic: input.diagnostic,
      pendingSettlementTileKeys: [...input.pendingSettlementTileKeys].sort()
    }
  };
};
