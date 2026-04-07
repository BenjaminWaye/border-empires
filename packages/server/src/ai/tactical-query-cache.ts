export type CachedTacticalQueryRecord<T> = {
  version: number;
  signature: string;
  updatedAt: number;
  value: T;
};

export const resolveCachedTacticalQuery = <T>(
  cache: Map<string, CachedTacticalQueryRecord<unknown>>,
  key: string,
  options: {
    version: number;
    signature: string;
    nowMs: number;
    minIntervalMs: number;
    compute: () => T;
  }
): T => {
  const existing = cache.get(key) as CachedTacticalQueryRecord<T> | undefined;
  if (
    existing &&
    existing.version === options.version &&
    existing.signature === options.signature &&
    options.nowMs - existing.updatedAt < options.minIntervalMs
  ) {
    return existing.value;
  }

  const value = options.compute();
  cache.set(key, {
    version: options.version,
    signature: options.signature,
    updatedAt: options.nowMs,
    value
  });
  return value;
};
