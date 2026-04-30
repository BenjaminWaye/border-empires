export const addOwnedIndexEntry = <TKey extends string>(
  index: Map<string, Set<TKey>>,
  ownerId: string,
  key: TKey
): void => {
  let keys = index.get(ownerId);
  if (!keys) {
    keys = new Set<TKey>();
    index.set(ownerId, keys);
  }
  keys.add(key);
};

export const removeOwnedIndexEntry = <TKey extends string>(
  index: Map<string, Set<TKey>>,
  ownerId: string,
  key: TKey
): void => {
  const keys = index.get(ownerId);
  if (!keys) return;
  keys.delete(key);
  if (keys.size <= 0) index.delete(ownerId);
};

export const valuesForOwnedIndex = <TKey extends string, TValue>(
  index: Map<string, Set<TKey>>,
  ownerId: string,
  source: ReadonlyMap<TKey, TValue>
): TValue[] => {
  const keys = index.get(ownerId);
  if (!keys || keys.size <= 0) return [];
  const values: TValue[] = [];
  for (const key of keys) {
    const value = source.get(key);
    if (value !== undefined) values.push(value);
  }
  return values;
};
