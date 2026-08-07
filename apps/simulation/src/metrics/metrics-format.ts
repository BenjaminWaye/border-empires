/** Pure formatting / sampling helpers shared by the simulation metrics module. */

export const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? 0;
};

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

export const quantileSample = (series: number[]): QuantileSample => ({
  p50: quantile(series, 0.5),
  p95: quantile(series, 0.95),
  p99: quantile(series, 0.99)
});
