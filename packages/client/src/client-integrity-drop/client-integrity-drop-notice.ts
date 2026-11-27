// Raises the Integrity drop notice (owner request, 2026-11-27: players saw
// 100% → 89% with no explanation). Fed from every PLAYER_UPDATE that carries
// the server's integrityPct; the throttle lives in client-integrity-drop-tracker.ts
// and the cause in client-integrity-drop-cause.ts. The notice goes on the alert
// card (warn feed entry) whose "Fix" button opens the Integrity panel with weak
// tiles and holes highlighted on the map, and is kept on state for the panel's
// "Why it fell" card.

import type { ClientState } from "../client-state/client-state.js";
import type { FeedEntry, Tile } from "../client-types.js";
import { wrapTileX, wrapTileY } from "../client-app-runtime-utils.js";
import { integrityDropNotice, type IntegritySnapshot } from "./client-integrity-drop-cause.js";
import { createIntegrityDropTracker, observeIntegrity } from "./client-integrity-drop-tracker.js";
import { scanIntegrityShape } from "./client-integrity-shape.js";

type DropState = Pick<ClientState, "me" | "tiles" | "defensibilityPct" | "ownedT" | "settledT" | "settledE" | "integrityDropNotice">;

export type IntegrityDropDeps = {
  readonly keyFor: (x: number, y: number) => string;
  readonly terrainAt: (x: number, y: number) => Tile["terrain"];
  readonly pushFeedEntry: (entry: FeedEntry) => void;
  readonly renderHud: () => void;
};

let tracker = createIntegrityDropTracker();
let baselineKeys: Set<string> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

const snapshotOf = (state: DropState): IntegritySnapshot | undefined => {
  if (state.ownedT === undefined || !Number.isFinite(state.defensibilityPct)) return undefined;
  return { pct: state.defensibilityPct, owned: state.ownedT, garrisoned: state.settledT, openSides: state.settledE };
};

const shapeArgs = (state: DropState, deps: IntegrityDropDeps) => ({
  tiles: state.tiles,
  me: state.me,
  keyFor: deps.keyFor,
  wrapX: wrapTileX,
  wrapY: wrapTileY,
  terrainAt: deps.terrainAt
});

const rememberShape = (state: DropState, deps: IntegrityDropDeps): void => {
  const scan = scanIntegrityShape(shapeArgs(state, deps));
  baselineKeys = new Set([...scan.holes, ...scan.thinLines].map((spot) => spot.key));
};

/** The alert card line: cause, then the fix. */
export const integrityDropFeedEntry = (notice: NonNullable<ClientState["integrityDropNotice"]>): FeedEntry => ({
  title: `Integrity ${notice.fromPct}% → ${notice.toPct}%`,
  text: `${notice.cause} · ${notice.fix}`,
  type: "info",
  severity: "warn",
  at: notice.at,
  openPanel: "integrity",
  actionLabel: "Fix"
});

const observe = (state: DropState, deps: IntegrityDropDeps): void => {
  const snapshot = snapshotOf(state);
  if (!snapshot) return;
  const hadBaseline = tracker.baseline !== undefined;
  const nowMs = Date.now();
  const decision = observeIntegrity(tracker, snapshot, nowMs);
  if (!hadBaseline) rememberShape(state, deps);
  if (decision.kind === "wait") {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      observe(state, deps);
    }, decision.ms);
    return;
  }
  if (decision.kind !== "notice") return;
  const scan = scanIntegrityShape(shapeArgs(state, deps));
  const notice = integrityDropNotice(decision.before, decision.after, scan, baselineKeys, nowMs);
  baselineKeys = new Set([...scan.holes, ...scan.thinLines].map((spot) => spot.key));
  state.integrityDropNotice = notice;
  deps.pushFeedEntry(integrityDropFeedEntry(notice));
  deps.renderHud();
};

/** Call after applyPlayerUpdateIntegrity. Only full updates (with the server's integrityPct) count. */
export const observeIntegrityDropFromUpdate = (state: DropState, msg: { readonly integrityPct?: unknown }, deps: IntegrityDropDeps): void => {
  if (typeof msg.integrityPct !== "number" || !Number.isFinite(msg.integrityPct)) return;
  observe(state, deps);
};

/** On INIT (login, reconnect, new season): the next fresh value is a new baseline, never a drop. */
export const resetIntegrityDropTracking = (): void => {
  tracker = createIntegrityDropTracker();
  baselineKeys = undefined;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
};
