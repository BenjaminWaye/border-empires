import type { EconomicStructureType, TileKey } from "@border-empires/shared";

export type AiExecuteFrontierCandidate = {
  kind: "frontier";
  originTileKey: TileKey;
  targetTileKey: TileKey;
};

export type AiExecuteTileCandidate = {
  kind: "tile";
  tileKey: TileKey;
};

export type AiExecuteEconomicStructureCandidate = {
  kind: "economic_structure";
  tileKey: TileKey;
  structureType: EconomicStructureType;
};

export type AiExecuteCandidate =
  | AiExecuteFrontierCandidate
  | AiExecuteTileCandidate
  | AiExecuteEconomicStructureCandidate;

type AiExecuteCandidateCacheBucket = {
  version: number;
  candidatesByKey: Map<string, AiExecuteCandidate | null>;
};

export type AiExecuteCandidateCacheState = Map<string, AiExecuteCandidateCacheBucket>;

const cacheKeyForAction = (actionKey: string, victoryPath?: string): string => `${actionKey}|${victoryPath ?? "none"}`;

const bucketForPlayer = (
  state: AiExecuteCandidateCacheState,
  playerId: string,
  version: number
): AiExecuteCandidateCacheBucket => {
  const existing = state.get(playerId);
  if (existing && existing.version === version) return existing;
  const rebuilt = { version, candidatesByKey: new Map<string, AiExecuteCandidate | null>() };
  state.set(playerId, rebuilt);
  return rebuilt;
};

export const createAiExecuteCandidateCacheState = (): AiExecuteCandidateCacheState => new Map();

export const clearAllAiExecuteCandidates = (state: AiExecuteCandidateCacheState): void => {
  state.clear();
};

export const cachedAiExecuteCandidate = (
  state: AiExecuteCandidateCacheState,
  {
    playerId,
    version,
    actionKey,
    victoryPath,
    build
  }: {
    playerId: string;
    version: number;
    actionKey: string;
    victoryPath?: string;
    build: () => AiExecuteCandidate | null;
  }
): AiExecuteCandidate | null => {
  const bucket = bucketForPlayer(state, playerId, version);
  const cacheKey = cacheKeyForAction(actionKey, victoryPath);
  if (bucket.candidatesByKey.has(cacheKey)) return bucket.candidatesByKey.get(cacheKey) ?? null;
  const candidate = build();
  bucket.candidatesByKey.set(cacheKey, candidate);
  return candidate;
};
