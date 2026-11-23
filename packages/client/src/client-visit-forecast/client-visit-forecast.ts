// End-of-visit forecast (docs/visit-as-a-turn.md §2.4): what will happen while the player is away, built only
// from state the client already holds and the same estimates other screens show (manpower refills, the town
// screen's growth estimate, the victory hold clock). It promises nothing it can't see: queued work that has
// not started gets a count, not a time. Pure; client-visit-forecast-state.ts reads ClientState into the input.

export type ForecastKind = "builds" | "paused" | "queue" | "expansions" | "manpower_batch" | "manpower_full" | "town_ready" | "hold_own" | "hold_rival" | "truce_end";

export type ForecastItem = {
  kind: ForecastKind;
  text: string;
  /** Time until it happens; undefined for things with no known time (queued work). */
  inMs?: number;
  /** A tile to show on the map. */
  focus?: { x: number; y: number };
  /** A HUD screen that has the detail (data-hud-v2-open). */
  open?: string;
};

export type ForecastInput = {
  /** Builds and garrisons holding a development slot now. */
  active: ReadonlyArray<{ label: string; x: number; y: number; remainingMs: number; paused?: boolean }>;
  /** Builds and garrisons waiting for a slot. */
  queued: number;
  /** Queued Expand To targets, and how many of them are waiting for manpower. */
  expansions: { total: number; paused: number };
  manpower: {
    current: number;
    cap: number;
    /** Time until the pool reaches the cap (msUntilManpowerFull); undefined while it is not refilling. */
    fullInMs: number | undefined;
    nextBatchInMs: number | undefined;
    /** What the next batch adds, when the server's figure is still current. */
    nextBatchGain: number | undefined;
  };
  /** Own towns still growing toward a tier they can't buy yet, with the town screen's own time estimate. */
  towns: ReadonlyArray<{ name: string; x: number; y: number; nextTier: string; readyInMs: number }>;
  /** Victory holds that are running. */
  holds: ReadonlyArray<{ pathName: string; holderName: string; mine: boolean; remainingMs: number }>;
  truces: ReadonlyArray<{ name: string; endsInMs: number }>;
};

export type VisitForecast = {
  /** Soonest first; things without a time last. */
  items: ForecastItem[];
  /** The earliest thing worth coming back for. */
  returnIn?: { inMs: number; reason: string };
};

/** Town rows are capped so a wide empire does not bury the manpower and hold lines. */
export const FORECAST_TOWN_CAP = 3;
/** Nothing sooner than this is suggested as a time to come back: the player is still here. */
export const MIN_RETURN_MS = 15 * 60_000;

/** "40s", "45m", "7h 40m", "2d 3h": short enough for a phone row. */
export const formatAhead = (ms: number): string => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  const hours = Math.round(minutes / 60);
  return hours % 24 === 0 ? `${hours / 24}d` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const count = (n: number): string => n.toLocaleString("en-US");

const RETURN_REASON: Partial<Record<ForecastKind, string>> = {
  builds: "your slots are free again",
  manpower_full: "manpower is full",
  town_ready: "a town can be upgraded",
  hold_own: "your hold is about to complete",
  hold_rival: "a rival's hold is about to complete",
  truce_end: "a truce ends"
};

const workItems = (input: ForecastInput): ForecastItem[] => {
  const items: ForecastItem[] = [];
  const running = input.active.filter((slot) => !slot.paused);
  const paused = input.active.length - running.length;
  const only = running[0];
  if (running.length === 1 && only) {
    items.push({ kind: "builds", text: `${only.label} at (${only.x}, ${only.y}) finishes in ${formatAhead(only.remainingMs)}`, inMs: only.remainingMs, focus: { x: only.x, y: only.y } });
  } else if (running.length > 1) {
    const last = Math.max(...running.map((slot) => slot.remainingMs));
    items.push({ kind: "builds", text: `${running.length} builds and garrisons finish within ${formatAhead(last)}`, inMs: last });
  }
  if (paused > 0) items.push({ kind: "paused", text: `${paused} build${paused === 1 ? " is" : "s are"} paused by an attack on the tile` });
  if (input.queued > 0) items.push({ kind: "queue", text: `${count(input.queued)} more queued: each starts when a slot is free` });
  const { total, paused: waiting } = input.expansions;
  if (total > 0) {
    const note = waiting === 0 ? "" : waiting === total ? " (waiting for manpower)" : ` (${waiting} waiting for manpower)`;
    items.push({ kind: "expansions", text: `${total} queued expansion${total === 1 ? " keeps" : "s keep"} claiming toward ${total === 1 ? "its target" : "their targets"}${note}` });
  }
  return items;
};

const manpowerItems = (manpower: ForecastInput["manpower"]): ForecastItem[] => {
  if (manpower.current >= manpower.cap) return [];
  const items: ForecastItem[] = [];
  const { nextBatchInMs, nextBatchGain, fullInMs } = manpower;
  // One batch that fills the pool is the "full" line; the batch line would say the same thing twice.
  const batchFills = nextBatchInMs !== undefined && fullInMs !== undefined && fullInMs <= nextBatchInMs;
  if (nextBatchInMs !== undefined && nextBatchGain !== undefined && nextBatchGain > 0 && !batchFills) {
    items.push({ kind: "manpower_batch", text: `Next manpower batch +${count(Math.round(nextBatchGain))} in ${formatAhead(nextBatchInMs)}`, inMs: nextBatchInMs });
  }
  if (fullInMs !== undefined) items.push({ kind: "manpower_full", text: `Manpower full in ${formatAhead(fullInMs)}`, inMs: fullInMs });
  return items;
};

export const visitForecast = (input: ForecastInput): VisitForecast => {
  const towns = [...input.towns].sort((a, b) => a.readyInMs - b.readyInMs).slice(0, FORECAST_TOWN_CAP).map((town): ForecastItem => ({
    kind: "town_ready", text: `${town.name} can be upgraded to ${town.nextTier} in about ${formatAhead(town.readyInMs)}`, inMs: town.readyInMs, focus: { x: town.x, y: town.y }
  }));
  const holds = input.holds.map((hold): ForecastItem => hold.mine
    ? { kind: "hold_own", text: `Your ${hold.pathName} hold wins the Sector Contest in ${formatAhead(hold.remainingMs)} if it stands`, inMs: hold.remainingMs, open: "ranks" }
    : { kind: "hold_rival", text: `${hold.holderName}'s ${hold.pathName} hold wins the Sector Contest in ${formatAhead(hold.remainingMs)} unless it is broken`, inMs: hold.remainingMs, open: "ranks" });
  const truces = input.truces.map((truce): ForecastItem => ({ kind: "truce_end", text: `Truce with ${truce.name} ends in ${formatAhead(truce.endsInMs)}`, inMs: truce.endsInMs, open: "diplomacy" }));
  const items = [...workItems(input), ...manpowerItems(input.manpower), ...towns, ...holds, ...truces]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.inMs ?? Infinity) - (b.item.inMs ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);
  const next = items.find((item) => item.inMs !== undefined && item.inMs >= MIN_RETURN_MS && RETURN_REASON[item.kind] !== undefined);
  const reason = next ? RETURN_REASON[next.kind] : undefined;
  return { items, ...(next && next.inMs !== undefined && reason ? { returnIn: { inMs: next.inMs, reason } } : {}) };
};
