// A muster flag taken with its tile (apps/simulation/src/muster-capture/):
// the captor gains its manpower, the owner loses it. Each side gets a feed
// entry and a short-lived "+N" / "−N" label over the tile, drawn by both map
// renderers from `musterCaptureLabels` (2D: client-map-2d-muster-capture-labels.ts,
// 3D: syncMusterCaptureLabels in client-map-3d/client-map-3d-fx-cast-overlays.ts).
import { MUSTER_CAPTURED_MESSAGE_TYPE, MUSTER_LOST_MESSAGE_TYPE } from "@border-empires/shared";
import type { FeedEntry } from "../client-types.js";

export const MUSTER_CAPTURE_LABEL_MS = 5_000;
/** Bounded: a burst of captures keeps only the newest labels. */
export const MUSTER_CAPTURE_LABEL_MAX = 12;
export const MUSTER_CAPTURE_GAIN_COLOR = "#7fe08a";
export const MUSTER_CAPTURE_LOSS_COLOR = "#ff4a3d";

export type MusterCaptureLabel = {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  startedAt: number;
};

export type MusterCaptureLabelState = {
  musterCaptureLabels: MusterCaptureLabel[];
  musterCaptureLabelSeq: number;
};

export const createInitialMusterCaptureLabelState = (): MusterCaptureLabelState => ({
  musterCaptureLabels: [],
  musterCaptureLabelSeq: 0
});

export const pushMusterCaptureLabel = (state: MusterCaptureLabelState, label: Omit<MusterCaptureLabel, "id">): void => {
  state.musterCaptureLabelSeq += 1;
  state.musterCaptureLabels.push({ ...label, id: state.musterCaptureLabelSeq });
  if (state.musterCaptureLabels.length > MUSTER_CAPTURE_LABEL_MAX) state.musterCaptureLabels.splice(0, state.musterCaptureLabels.length - MUSTER_CAPTURE_LABEL_MAX);
};

/** Drops expired labels and returns the live ones. */
export const liveMusterCaptureLabels = (state: MusterCaptureLabelState, nowMs: number): readonly MusterCaptureLabel[] => {
  const labels = state.musterCaptureLabels;
  if (labels.length > 0 && nowMs - labels[0]!.startedAt >= MUSTER_CAPTURE_LABEL_MS) {
    state.musterCaptureLabels = labels.filter((label) => nowMs - label.startedAt < MUSTER_CAPTURE_LABEL_MS);
  }
  return state.musterCaptureLabels;
};

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isCoord = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const whole = (value: number): string => Math.round(value).toLocaleString("en-US");

/**
 * Applies MUSTER_CAPTURED / MUSTER_LOST. Returns true when `msg` was one of
 * them (even if malformed), so the network dispatcher stops there.
 */
export const handleMusterCaptureMessage = (
  msg: Record<string, unknown>,
  state: MusterCaptureLabelState & { playerNames: ReadonlyMap<string, string> },
  pushFeed: (entry: FeedEntry) => void,
  renderHud: () => void,
  nowMs: number = Date.now()
): boolean => {
  if (msg.type !== MUSTER_CAPTURED_MESSAGE_TYPE && msg.type !== MUSTER_LOST_MESSAGE_TYPE) return false;
  if (!isCoord(msg.x) || !isCoord(msg.y) || !isCount(msg.amount)) return true;
  const at = { focusX: msg.x, focusY: msg.y, actionLabel: "Center" };
  if (msg.type === MUSTER_CAPTURED_MESSAGE_TYPE) {
    const gained = isCount(msg.gained) ? msg.gained : msg.amount;
    const from = typeof msg.fromPlayerId === "string" ? state.playerNames.get(msg.fromPlayerId) : undefined;
    const capped = gained < msg.amount ? ` (${whole(msg.amount)} on flag, at cap)` : "";
    pushMusterCaptureLabel(state, { x: msg.x, y: msg.y, text: `+${whole(gained)} manpower`, color: MUSTER_CAPTURE_GAIN_COLOR, startedAt: nowMs });
    pushFeed({ title: "Muster flag captured", text: `${from ? `From ${from}` : "Captured"} at (${msg.x}, ${msg.y}): +${whole(gained)} manpower${capped}.`, type: "combat", severity: "success", at: nowMs, ...at });
  } else {
    const by = typeof msg.byPlayerId === "string" ? state.playerNames.get(msg.byPlayerId) : undefined;
    pushMusterCaptureLabel(state, { x: msg.x, y: msg.y, text: `−${whole(msg.amount)} manpower`, color: MUSTER_CAPTURE_LOSS_COLOR, startedAt: nowMs });
    pushFeed({ title: "Muster flag lost", text: `${by ? `Taken by ${by}` : "Taken"} at (${msg.x}, ${msg.y}): −${whole(msg.amount)} manpower.`, type: "combat", severity: "warn", at: nowMs, ...at });
  }
  renderHud();
  return true;
};
