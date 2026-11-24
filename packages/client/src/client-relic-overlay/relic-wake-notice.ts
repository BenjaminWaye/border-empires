import type { RelicMapHint } from "@border-empires/shared";
import type { FeedEntry } from "../client-types.js";
import type { ClientState } from "../client-state/client-state.js";
import { playerDisplayNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";

// A rival's aether wake (docs/relics.md, "Aether wake") reaches every House
// map-wide, through unexplored ground. The column and the violet minimap box
// alone did not say what they were (player report 2026-11-23), so the first
// time this client sees a given House operating a given relic it posts one
// alert naming it, with Show to centre the map on the site.

export type RelicWakeNoticeState = {
  me: string;
  relicMapHints: ReadonlyMap<string, RelicMapHint>;
};

const STORAGE_KEY = "be.seenRelicWakes";
const MAX_REMEMBERED = 60;

/** Wakes already announced this session, seeded from storage so a reload does not repeat them. */
const seen = new Set<string>();
let loaded = false;

const loadSeen = (): void => {
  if (loaded) return;
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) for (const key of parsed) if (typeof key === "string") seen.add(key);
  } catch {
    // Storage blocked or corrupt: announce again rather than never.
  }
};

const saveSeen = (): void => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-MAX_REMEMBERED)));
  } catch {
    // Best effort only.
  }
};

/** A wake is new when this viewer has not been told that House runs that site. */
export const relicWakeNoticeKey = (me: string, hint: Extract<RelicMapHint, { kind: "WAKE" }>): string => `${me}|${hint.x},${hint.y}|${hint.ownerId}`;

export const relicWakeFeedEntry = (hint: Extract<RelicMapHint, { kind: "WAKE" }>, ownerName: string | undefined, at: number): FeedEntry => ({
  title: "Concordance relic running",
  text: `${ownerName ?? "A rival House"} · (${hint.x}, ${hint.y})`,
  type: "info",
  severity: "info",
  at,
  focusX: hint.x,
  focusY: hint.y,
  actionLabel: "Show",
  alert: true
});

/** Posts one alert per unseen wake. Returns how many were posted. */
export const announceNewRelicWakes = (
  state: RelicWakeNoticeState,
  push: (entry: FeedEntry) => void,
  ownerName: (ownerId: string) => string | undefined,
  now: number = Date.now()
): number => {
  if (!state.me) return 0;
  loadSeen();
  let posted = 0;
  for (const hint of state.relicMapHints.values()) {
    if (hint.kind !== "WAKE" || hint.ownerId === state.me) continue;
    const key = relicWakeNoticeKey(state.me, hint);
    if (seen.has(key)) continue;
    seen.add(key);
    push(relicWakeFeedEntry(hint, ownerName(hint.ownerId), now));
    posted += 1;
  }
  if (posted > 0) saveSeen();
  return posted;
};

/** The live client's entry point: names the operator from the leaderboard or diplomacy names. */
export const announceRelicWakesForClient = (
  state: Pick<ClientState, "me" | "meName" | "playerNames" | "leaderboard" | "relicMapHints">,
  push: (entry: FeedEntry) => void
): number => announceNewRelicWakes(state, push, (ownerId) => playerDisplayNameForOwnerFromState(state, ownerId));

/** Test seam: forget announced wakes and re-read storage on next use. */
export const resetRelicWakeNoticesForTest = (): void => {
  seen.clear();
  loaded = false;
};
