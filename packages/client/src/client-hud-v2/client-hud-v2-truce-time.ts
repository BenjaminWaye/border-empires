// Time left on a truce, as the HUD shows it: whole hours (rounded up) while an
// hour or more remains, then minutes (rounded up) for the final hour so a
// truce about to lapse reads "42m" instead of a flat "1h".

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export const truceTimeLeft = (endsAt: number, nowMs: number): string => {
  const ms = Math.max(0, endsAt - nowMs);
  if (ms >= HOUR_MS) return `${Math.ceil(ms / HOUR_MS)}h`;
  return `${Math.max(1, Math.ceil(ms / MINUTE_MS))}m`;
};
