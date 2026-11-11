import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMERA_LOCATION_BY_PLAYER_STORAGE_KEY } from "../client-constants.js";
import {
  MAX_STORED_CAMERA_ACCOUNTS,
  cameraLocationInitialState,
  reconcileStoredCameraForPlayer,
  readStoredCameraLocationForPlayer,
  writeStoredCameraLocation
} from "./client-camera-storage.js";

// Regression: logging out reloads the page and the boot-time camera restore
// read one shared slot, so logging in as another account on the same browser
// landed on the previous account's territory instead of your own.
describe("per-account camera storage", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("window", {
      location: { search: "" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const bootState = () => ({ ...cameraLocationInitialState() });

  it("restores each account's own last-viewed spot after switching accounts", () => {
    writeStoredCameraLocation({ x: 10, y: 20, zoom: 30, seasonId: "s1", playerId: "alice" }, 1);
    writeStoredCameraLocation({ x: 400, y: 290, zoom: 50, seasonId: "s1", playerId: "bob" }, 2);

    // Bob saved last, so boot restores Bob's spot -- but Alice logs in.
    const state = bootState();
    expect(state.camX).toBe(400);
    expect(state.cameraRestoredPlayerId).toBe("bob");

    reconcileStoredCameraForPlayer(state, "alice");

    expect(state.cameraRestoredFromStorage).toBe(true);
    expect([state.camX, state.camY, state.zoom]).toEqual([10, 20, 30]);
    expect(state.cameraRestoredSeasonId).toBe("s1");
  });

  it("drops the restore (so INIT centres on home) for an account with no saved spot", () => {
    writeStoredCameraLocation({ x: 400, y: 290, zoom: 50, seasonId: "s1", playerId: "bob" }, 1);
    const state = bootState();

    reconcileStoredCameraForPlayer(state, "carol");

    expect(state.cameraRestoredFromStorage).toBe(false);
  });

  it("leaves the camera alone when the same account logs back in", () => {
    writeStoredCameraLocation({ x: 400, y: 290, zoom: 50, seasonId: "s1", playerId: "bob" }, 1);
    const state = bootState();

    reconcileStoredCameraForPlayer(state, "bob");

    expect(state.cameraRestoredFromStorage).toBe(true);
    expect(state.camX).toBe(400);
  });

  it("never swaps a ?x=&y= deep-linked camera", () => {
    writeStoredCameraLocation({ x: 400, y: 290, zoom: 50, seasonId: "s1", playerId: "bob" }, 1);
    vi.stubGlobal("window", { ...window, location: { search: "?x=141&y=174" } });
    const state = bootState();

    reconcileStoredCameraForPlayer(state, "alice");

    expect(state.cameraRestoredFromStorage).toBe(true);
    expect([state.camX, state.camY]).toEqual([141, 174]);
  });

  it(`remembers at most ${MAX_STORED_CAMERA_ACCOUNTS} accounts, dropping the least recently saved`, () => {
    for (let i = 0; i <= MAX_STORED_CAMERA_ACCOUNTS; i += 1) {
      writeStoredCameraLocation({ x: i, y: i, zoom: 30, seasonId: undefined, playerId: `p${i}` }, i);
    }
    const stored = JSON.parse(storage.get(CAMERA_LOCATION_BY_PLAYER_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(stored)).toHaveLength(MAX_STORED_CAMERA_ACCOUNTS);
    expect(readStoredCameraLocationForPlayer("p0")).toBeNull();
    expect(readStoredCameraLocationForPlayer(`p${MAX_STORED_CAMERA_ACCOUNTS}`)?.x).toBe(MAX_STORED_CAMERA_ACCOUNTS);
  });
});
