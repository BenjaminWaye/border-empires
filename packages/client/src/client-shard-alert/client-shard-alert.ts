export type ClientShardRainAlert =
  | { key: string; phase: "upcoming"; startsAt: number }
  | { key: string; phase: "started"; startsAt: number; expiresAt: number; siteCount: number; sites?: { x: number; y: number }[] };

const pluralize = (value: number, unit: string): string => `${value} ${unit}${value === 1 ? "" : "s"}`;

export const formatShardRainRemaining = (ms: number): string => {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return pluralize(totalMinutes, "minute");
  if (minutes === 0) return pluralize(hours, "hour");
  return `${pluralize(hours, "hour")} ${pluralize(minutes, "minute")}`;
};

export const shardRainAlertDetail = (alert: ClientShardRainAlert, nowMs: number): string => {
  if (alert.phase === "upcoming") {
    return `Shard rain will begin in ${formatShardRainRemaining(alert.startsAt - nowMs)}.`;
  }
  return `Shard rain has begun. ${alert.siteCount} impact site${alert.siteCount === 1 ? "" : "s"} will remain for ${formatShardRainRemaining(alert.expiresAt - nowMs)}.`;
};

// Compact countdown line for a persistent panel (as opposed to the one-time
// alert overlay above). Returns "" when there is nothing to show so callers
// can omit the note line entirely.
export const formatShardRainCountdown = (alert: ClientShardRainAlert | undefined, nowMs: number): string => {
  if (!alert) return "";
  if (alert.phase === "started") {
    const remaining = alert.expiresAt - nowMs;
    if (remaining <= 0) return "";
    return `Shard rain active — ${alert.siteCount} site${alert.siteCount === 1 ? "" : "s"} — ${formatShardRainRemaining(remaining)} left`;
  }
  const remaining = alert.startsAt - nowMs;
  if (remaining <= 0) return "";
  return `Next shard rain in ${formatShardRainRemaining(remaining)}`;
};
