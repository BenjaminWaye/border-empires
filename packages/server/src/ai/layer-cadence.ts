export type AiLayerCadenceEntry = {
  updatedAt: number;
  signature: string;
};

export type AiLayerCadenceState = {
  entries: Map<string, AiLayerCadenceEntry>;
};

export const createAiLayerCadenceState = (): AiLayerCadenceState => ({
  entries: new Map<string, AiLayerCadenceEntry>()
});

export const shouldRefreshAiLayer = (
  state: AiLayerCadenceState,
  key: string,
  nowMs: number,
  minIntervalMs: number,
  signature: string
): boolean => {
  const entry = state.entries.get(key);
  if (!entry) return true;
  if (entry.signature !== signature) return true;
  return nowMs - entry.updatedAt >= minIntervalMs;
};

export const markAiLayerRefreshed = (
  state: AiLayerCadenceState,
  key: string,
  nowMs: number,
  signature: string
): void => {
  state.entries.set(key, {
    updatedAt: nowMs,
    signature
  });
};
