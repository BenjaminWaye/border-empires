export interface TestShard {
  index: number;
  total: number;
}

const shardPattern = /^([1-9]\d*)\/([1-9]\d*)$/;

/**
 * Parses the one-based shard syntax used by Vitest and the CI matrix. Keeping
 * the default as one shard means developers still run the full coverage set.
 */
export const parseTestShard = (value: string | undefined): TestShard => {
  if (value === undefined || value === "") return { index: 1, total: 1 };

  const match = shardPattern.exec(value);
  if (!match) throw new Error(`Invalid world-generation coverage shard: ${value}`);

  const index = Number(match[1]);
  const total = Number(match[2]);
  if (index > total) throw new Error(`World-generation coverage shard index exceeds its total: ${value}`);

  return { index, total };
};

/**
 * Selects a stable, disjoint slice while retaining every input across all
 * shards. Modulo assignment avoids coupling coverage to an incidental order.
 */
export const valuesForTestShard = <Value>(values: readonly Value[], shard: TestShard): Value[] => (
  values.filter((_, index) => index % shard.total === shard.index - 1)
);
