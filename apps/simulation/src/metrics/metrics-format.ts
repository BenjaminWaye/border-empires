/** Pure formatting / sampling helpers shared by the simulation metrics module. */

const quantileOfSorted = (sorted: readonly number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
};

export const quantile = (values: number[], q: number): number =>
  quantileOfSorted([...values].sort((a, b) => a - b), q);

export const clampMetric = (value: number): number => (Number.isFinite(value) && value >= 0 ? value : 0);
export const formatMetricValue = (value: number): string =>
  Number.isInteger(value) ? `${value}` : value.toFixed(3);

export const appendSample = (target: number[], value: number, limit: number): void => {
  target.push(clampMetric(value));
  if (target.length > limit) target.splice(0, target.length - limit);
};

export const appendRecent = <T>(target: T[], value: T, limit: number): void => {
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
};

export type QuantileSample = {
  p50: number;
  p95: number;
  p99: number;
};

// Sorts once per series: the sim's /metrics is scraped every 5s by the
// gateway's backlog poller and renders ~70 histogram series of up to 512
// samples each, so three independent copy+sorts per series was a measurable
// slice of sim-worker CPU on a shared-cpu-1x box.
export const quantileSample = (series: number[]): QuantileSample => {
  const sorted = [...series].sort((a, b) => a - b);
  return { p50: quantileOfSorted(sorted, 0.5), p95: quantileOfSorted(sorted, 0.95), p99: quantileOfSorted(sorted, 0.99) };
};
