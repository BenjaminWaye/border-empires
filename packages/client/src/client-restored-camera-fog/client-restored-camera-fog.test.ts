import { WORLD_WIDTH } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { recentreRestoredCameraOverFog, restoredViewHalfExtents, type RestoredCameraState, type RestoredCameraTile } from "./client-restored-camera-fog.js";

const PHONE = { width: 390, height: 844 };

const stateWith = (camX: number, camY: number, tiles: RestoredCameraTile[], zoom = 32): RestoredCameraState => ({
  camX,
  camY,
  camSubX: 0.4,
  camSubY: 0.2,
  zoom,
  me: "me",
  cameraRestoredFromStorage: true,
  cameraRestoredPlayerId: "me",
  tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]))
});

describe("restoredViewHalfExtents", () => {
  it("shrinks as the player zooms in and pads for the tilted 3D view", () => {
    expect(restoredViewHalfExtents(32, PHONE)).toEqual({ halfW: 10, halfH: 20 });
    expect(restoredViewHalfExtents(64, PHONE)).toEqual({ halfW: 5, halfH: 10 });
  });
});

describe("recentreRestoredCameraOverFog", () => {
  it("moves to the own tile nearest the restored spot when nothing in view is visible", () => {
    const state = stateWith(200, 200, [
      { x: 200, y: 200, ownerId: "rival", fogged: true },
      { x: 10, y: 10, ownerId: "me" },
      { x: 200, y: 230, ownerId: "me" }
    ]);
    expect(recentreRestoredCameraOverFog(state, PHONE)).toBe(true);
    expect([state.camX, state.camY, state.camSubX, state.camSubY]).toEqual([200, 230, 0, 0]);
    expect(state.cameraRestoredFromStorage).toBe(false);
  });

  it("keeps the view when a visible tile is on screen, whoever owns it", () => {
    const state = stateWith(200, 200, [{ x: 205, y: 215, ownerId: "ally" }, { x: 10, y: 10, ownerId: "me" }]);
    expect(recentreRestoredCameraOverFog(state, PHONE)).toBe(false);
    expect([state.camX, state.camY]).toEqual([200, 200]);
    expect(state.cameraRestoredFromStorage).toBe(true);
  });

  it("measures the view across the world's wrap seam", () => {
    const visibleAcrossSeam = stateWith(WORLD_WIDTH - 2, 50, [{ x: 3, y: 50, ownerId: "me" }]);
    expect(recentreRestoredCameraOverFog(visibleAcrossSeam, PHONE)).toBe(false);

    const ownLandAcrossSeam = stateWith(WORLD_WIDTH - 2, 50, [{ x: 40, y: 50, ownerId: "me" }, { x: 20, y: 50, ownerId: "me" }]);
    expect(recentreRestoredCameraOverFog(ownLandAcrossSeam, PHONE)).toBe(true);
    expect(ownLandAcrossSeam.camX).toBe(20);
  });

  it("leaves deep links, unrestored cameras and not-yet-loaded land alone", () => {
    const deepLink = { ...stateWith(200, 200, [{ x: 10, y: 10, ownerId: "me" }]), cameraRestoredPlayerId: null };
    expect(recentreRestoredCameraOverFog(deepLink, PHONE)).toBe(false);

    const notRestored = { ...stateWith(200, 200, [{ x: 10, y: 10, ownerId: "me" }]), cameraRestoredFromStorage: false };
    expect(recentreRestoredCameraOverFog(notRestored, PHONE)).toBe(false);

    const noOwnTiles = stateWith(200, 200, [{ x: 10, y: 10, ownerId: "rival", fogged: true }]);
    expect(recentreRestoredCameraOverFog(noOwnTiles, PHONE)).toBe(false);
    expect(noOwnTiles.cameraRestoredFromStorage).toBe(true);
  });
});
