import { CAMERA_LOCATION_BY_PLAYER_STORAGE_KEY, CAMERA_LOCATION_STORAGE_KEY, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { storageGet, storageSet } from "./client-state.js";

// Reads a deep-linked tile from the page URL, e.g. the "Go to tile" link in
// an attack-alert email (see sendAttackAlert() in
// apps/realtime-gateway/src/email-alerts/email-alerts.ts): "?x=141&y=174".
// Returns null when either coordinate is missing or not a finite number, so
// callers fall back to the stored/default camera location.
export const readUrlTileFocus = (
  locationLike: Pick<Location, "search"> | undefined = typeof window !== "undefined" ? window.location : undefined
): { x: number; y: number } | null => {
  if (!locationLike) return null;
  const params = new URLSearchParams(locationLike.search);
  const rawX = params.get("x");
  const rawY = params.get("y");
  if (rawX === null || rawY === null) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

// Strips the ?x=&y= deep-link params (see readUrlTileFocus() above) from the
// address bar once they've been consumed, so a later reload doesn't keep
// jumping the camera back to a stale tile instead of restoring the player's
// last-viewed location.
export const clearUrlTileFocus = (): void => {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("x") && !url.searchParams.has("y")) return;
  url.searchParams.delete("x");
  url.searchParams.delete("y");
  window.history.replaceState(window.history.state, document.title, url.toString());
};

type StoredCameraLocation = { x: number; y: number; zoom: number; seasonId: string | undefined; playerId: string | undefined };

// How many accounts' camera positions one browser remembers. Bounded so the
// by-player map can't grow without limit; least recently saved is dropped.
export const MAX_STORED_CAMERA_ACCOUNTS = 8;

const parseCameraLocation = (value: unknown): StoredCameraLocation | null => {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { x?: unknown; y?: unknown; zoom?: unknown; seasonId?: unknown; playerId?: unknown };
  if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
  const zoom = Number.isFinite(parsed.zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(parsed.zoom))) : DEFAULT_ZOOM;
  const seasonId = typeof parsed.seasonId === "string" ? parsed.seasonId : undefined;
  const playerId = typeof parsed.playerId === "string" && parsed.playerId !== "" ? parsed.playerId : undefined;
  return { x: Number(parsed.x), y: Number(parsed.y), zoom, seasonId, playerId };
};

// Reads the last-viewed map location saved by saveCameraLocation() in
// client-view-refresh.ts. Returns null if nothing is stored or the payload
// is malformed, so callers fall back to the default (0,0) / home-tile camera.
// seasonId (if present) is the season the saved position belongs to — see
// cameraLocationInitialState() for why this is needed on a fresh page load.
// playerId is the account that saved it: at boot the client doesn't know who
// is logging in yet, so INIT checks it (reconcileStoredCameraForPlayer()).
export const readStoredCameraLocation = (): StoredCameraLocation | null => {
  const raw = storageGet(CAMERA_LOCATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return parseCameraLocation(JSON.parse(raw));
  } catch {
    return null;
  }
};

type CameraLocationsByPlayer = Record<string, { x: number; y: number; zoom: number; seasonId?: string | undefined; savedAt: number }>;

const readCameraLocationsByPlayer = (): CameraLocationsByPlayer => {
  const raw = storageGet(CAMERA_LOCATION_BY_PLAYER_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as CameraLocationsByPlayer) : {};
  } catch {
    return {};
  }
};

export const readStoredCameraLocationForPlayer = (playerId: string): StoredCameraLocation | null => {
  if (!playerId) return null;
  const entry = parseCameraLocation(readCameraLocationsByPlayer()[playerId]);
  return entry ? { ...entry, playerId } : null;
};

// Writes both the "last account" slot (read at boot) and this account's own
// slot (read by INIT when a different account logs in on this browser).
export const writeStoredCameraLocation = (location: { x: number; y: number; zoom: number; seasonId: string | undefined; playerId: string }, now = Date.now()): void => {
  storageSet(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify(location));
  const byPlayer = readCameraLocationsByPlayer();
  byPlayer[location.playerId] = { x: location.x, y: location.y, zoom: location.zoom, seasonId: location.seasonId, savedAt: now };
  const kept = Object.entries(byPlayer)
    .sort((a, b) => (Number(b[1]?.savedAt) || 0) - (Number(a[1]?.savedAt) || 0))
    .slice(0, MAX_STORED_CAMERA_ACCOUNTS);
  storageSet(CAMERA_LOCATION_BY_PLAYER_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
};

// With a playerId, forgets only that account's position (and the "last
// account" slot if it is theirs), so one account's stale-season or
// pre-spawn camera doesn't wipe the other accounts on this browser. Without
// one (a season rollover seen live), forgets every account.
export const clearStoredCameraLocations = (playerId?: string): void => {
  try {
    if (!playerId) {
      window.localStorage.removeItem(CAMERA_LOCATION_STORAGE_KEY);
      window.localStorage.removeItem(CAMERA_LOCATION_BY_PLAYER_STORAGE_KEY);
      return;
    }
    if (readStoredCameraLocation()?.playerId === playerId) window.localStorage.removeItem(CAMERA_LOCATION_STORAGE_KEY);
    const byPlayer = readCameraLocationsByPlayer();
    if (!(playerId in byPlayer)) return;
    delete byPlayer[playerId];
    storageSet(CAMERA_LOCATION_BY_PLAYER_STORAGE_KEY, JSON.stringify(byPlayer));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

// Account switches normally reload the page (settings logout), but a guest
// rejected for a full Sector is signed out in place and can sign in as
// someone else on the same page. Treat that INIT like a fresh load for the
// new account: restore its own saved spot or let INIT centre on its home.
// Returns true when the camera should be (re)placed for a new account.
export const prepareCameraForIncomingPlayer = (
  state: Parameters<typeof reconcileStoredCameraForPlayer>[0] & { me: string },
  incomingPlayerId: string,
  isFirstInitThisSession: boolean
): boolean => {
  const switchedInPlace = !isFirstInitThisSession && state.me !== "" && incomingPlayerId !== "" && state.me !== incomingPlayerId;
  if (switchedInPlace) {
    state.cameraRestoredFromStorage = true;
    state.cameraRestoredPlayerId = state.me;
  }
  if (isFirstInitThisSession || switchedInPlace) reconcileStoredCameraForPlayer(state, incomingPlayerId);
  return switchedInPlace;
};

// Called once on the first INIT of a page load, when the server finally says
// which account is logged in. The camera restored at boot belongs to whoever
// saved last on this browser; if that's a different account (or an old
// untagged save), swap in this account's own saved position, or drop the
// restore so INIT centres on this account's home tile instead.
export const reconcileStoredCameraForPlayer = (
  state: { camX: number; camY: number; camSubX: number; camSubY: number; zoom: number; cameraRestoredFromStorage: boolean; cameraRestoredSeasonId: string | undefined; cameraRestoredPlayerId: string | null | undefined },
  incomingPlayerId: string
): void => {
  if (!state.cameraRestoredFromStorage || state.cameraRestoredPlayerId === null || !incomingPlayerId) return;
  if (state.cameraRestoredPlayerId === incomingPlayerId) return;
  const own = readStoredCameraLocationForPlayer(incomingPlayerId);
  state.cameraRestoredPlayerId = incomingPlayerId;
  if (!own) {
    state.cameraRestoredFromStorage = false;
    state.cameraRestoredSeasonId = undefined;
    return;
  }
  state.camX = own.x;
  state.camY = own.y;
  state.camSubX = 0;
  state.camSubY = 0;
  state.zoom = own.zoom;
  state.cameraRestoredSeasonId = own.seasonId;
};

// Bundles the restored (or default) camera fields for createInitialState()
// as a single spreadable object, so the caller doesn't need a local variable
// or multiple readStoredCameraLocation() calls. cameraRestoredFromStorage is
// consumed once by the first automatic centerOnOwnedTile() fallback in
// client-network.ts, so a restored location isn't discarded before the
// player's owned tiles have loaded in. cameraRestoredSeasonId is the season
// the restored position was saved under (undefined if never recorded) — the
// INIT handler (client-network-init-message.ts) uses it to detect a season
// rollover that happened while the tab was closed, since bridgeDebugSeasonId
// itself is always "" at this point (in-memory-only, reset every reload).
export const cameraLocationInitialState = (): {
  camX: number;
  camY: number;
  // Sub-tile fraction of an in-progress pan, in [0, 1) on each axis — camX/camY
  // stay whole tiles (every other consumer assumes that); the 3D camera folds
  // this into its pan offset (client-map-3d-perspective-camera.ts) so panning
  // glides between tiles instead of snapping. Always 0 on load, never persisted.
  camSubX: number;
  camSubY: number;
  zoom: number;
  cameraRestoredFromStorage: boolean;
  cameraRestoredSeasonId: string | undefined;
  // Account that saved the restored position (undefined for an old untagged
  // save, which INIT treats as some other account's). null for a ?x=&y=
  // deep link: that camera isn't tied to any account and is never swapped.
  cameraRestoredPlayerId: string | null | undefined;
} => {
  const urlFocus = readUrlTileFocus();
  if (urlFocus) {
    return {
      camX: urlFocus.x,
      camY: urlFocus.y,
      camSubX: 0,
      camSubY: 0,
      zoom: DEFAULT_ZOOM,
      // Reuses the "restored" one-shot skip (consumed in client-network.ts)
      // so the initial centerOnOwnedTile() fallback doesn't override a tile
      // the player was explicitly linked to.
      cameraRestoredFromStorage: true,
      cameraRestoredSeasonId: undefined,
      cameraRestoredPlayerId: null
    };
  }

  const stored = readStoredCameraLocation();
  return {
    camX: stored?.x ?? 0,
    camY: stored?.y ?? 0,
    camSubX: 0,
    camSubY: 0,
    zoom: stored?.zoom ?? DEFAULT_ZOOM,
    cameraRestoredFromStorage: stored !== null,
    cameraRestoredSeasonId: stored?.seasonId,
    cameraRestoredPlayerId: stored?.playerId
  };
};
