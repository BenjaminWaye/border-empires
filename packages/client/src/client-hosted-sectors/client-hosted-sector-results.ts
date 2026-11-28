// A hosted sector's outcome in My sectors, once the hosting service has saved
// its results: who was crowned, and this player's place. Hosted results are
// shown apart and never count toward rating (owner decision Q4).
export type HostedSectorResults = { finished: boolean; houses: number; rank?: number; winner?: string };

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const whole = (value: unknown, min: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min;

export const parseHostedSectorResults = (value: unknown): HostedSectorResults | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.finished !== "boolean" || !whole(record.houses, 1)) return undefined;
  return {
    finished: record.finished,
    houses: record.houses,
    ...(whole(record.rank, 1) ? { rank: record.rank } : {}),
    ...(typeof record.winner === "string" && record.winner ? { winner: record.winner.slice(0, 100) } : {})
  };
};

export const hostedSectorResultsHtml = (results: HostedSectorResults | undefined): string => {
  if (!results) return "";
  const outcome = results.finished
    ? results.winner ? `Won by ${escapeHtml(results.winner)}` : "Finished"
    : "Closed before anyone was crowned";
  const place = results.rank !== undefined ? ` · You placed #${results.rank} of ${results.houses}` : "";
  return `<span class="hosted-sector-meta hosted-sector-results">${outcome}${place} · Not counted toward rating</span>`;
};
