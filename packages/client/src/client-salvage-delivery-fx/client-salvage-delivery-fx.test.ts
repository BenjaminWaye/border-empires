import { AnimationClip, Bone, BoxGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, type Object3D } from "three";
import type { PopupMarineTemplate } from "../client-map-3d-popup-marine/popup-marine-asset.js";
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { emitSalvageDeliveries } from "./client-salvage-delivery-detect.js";
import {
  activeSalvageDelivery,
  createInitialSalvageDeliveryFxState,
  SALVAGE_DELIVERY_TOTAL_MS,
  SALVAGE_DEPART_START_MS,
  SALVAGE_MARCH_START_MS,
  SALVAGE_PACE,
  SALVAGE_RAMP_WALK_MS,
  SALVAGE_MARCHER_COUNT,
  SALVAGE_RAMP_FOOT_DY,
  SALVAGE_SHIP_DESCENT_MS,
  SALVAGE_SHIP_HOVER_HEIGHT,
  SALVAGE_SHIP_ORBIT_HEIGHT,
  salvageMarcherAt,
  salvageMarcherTargets,
  salvageShipAt,
  salvageShipmentLanded,
  snapshotSalvageLoadsShipped
} from "./client-salvage-delivery-fx.js";
import { createSalvageDeliveryFxLayer } from "./client-map-3d-salvage-delivery-fx.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const works = (x: number, y: number, ownerId: string, shipped: number | undefined): Tile =>
  ({ x, y, terrain: "LAND", ownerId, economicStructure: { type: "RECLAMATION_WORKS", status: "active", ...(shipped === undefined ? {} : { salvageLoadsShipped: shipped }) } }) as unknown as Tile;

describe("salvage delivery detection", () => {
  it("fires when the viewer's own Works ships a load, and not on first sight, other owners or no change", () => {
    expect(salvageShipmentLanded(snapshotSalvageLoadsShipped(works(1, 1, "me", undefined)), works(1, 1, "me", 1), "me")).toBe(true);
    expect(salvageShipmentLanded(1, works(1, 1, "me", 2), "me")).toBe(true);
    expect(salvageShipmentLanded(undefined, works(1, 1, "me", 1), "me")).toBe(false);
    expect(salvageShipmentLanded(1, works(1, 1, "me", 1), "me")).toBe(false);
    expect(salvageShipmentLanded(0, works(1, 1, "rival", 1), "me")).toBe(false);
    expect(snapshotSalvageLoadsShipped({ x: 0, y: 0, terrain: "LAND" } as Tile)).toBeUndefined();
  });

  it("queues one delivery with marchers heading into the House's own tiles", () => {
    const tiles = new Map<string, Tile>();
    tiles.set(keyFor(10, 10), works(10, 10, "me", 2));
    for (let x = 8; x <= 12; x += 1) for (let y = 12; y <= 13; y += 1) tiles.set(keyFor(x, y), { x, y, ownerId: "me" } as Tile);
    tiles.set(keyFor(10, 7), { x: 10, y: 7, ownerId: "rival" } as Tile);
    const state = { ...createInitialSalvageDeliveryFxState(), me: "me", tiles, playerColors: new Map([["me", "#ff0000"]]) };
    emitSalvageDeliveries({ state, tileUpdates: [{ x: 10, y: 10 }], previousShippedByKey: new Map([[keyFor(10, 10), 1]]), keyFor, nowEpochMs: 5_000 });
    expect(state.salvageDeliveryFxQueue).toHaveLength(1);
    const entry = state.salvageDeliveryFxQueue[0]!;
    expect(entry.color).toBe("#ff0000");
    expect(entry.marchers).toHaveLength(SALVAGE_MARCHER_COUNT);
    for (const m of entry.marchers) expect(tiles.get(keyFor(10 + m.dx, 10 + m.dy))?.ownerId).toBe("me");
    expect(activeSalvageDelivery(state, keyFor(10, 10), 5_100)).toBe(entry);
    expect(activeSalvageDelivery(state, keyFor(10, 10), 5_000 + SALVAGE_DELIVERY_TOTAL_MS)).toBeUndefined();
  });

  it("fans the column out when the Works has no own land round it", () => {
    const targets = salvageMarcherTargets({ x: 0, y: 0 }, () => false, { width: 100, height: 100 });
    expect(targets).toHaveLength(SALVAGE_MARCHER_COUNT);
    for (const t of targets) expect(Math.hypot(t.dx, t.dy)).toBeCloseTo(2);
  });

  it("wraps targets across the world seam", () => {
    const targets = salvageMarcherTargets({ x: 0, y: 0 }, (x) => x === 98, { width: 100, height: 100 });
    expect(targets.every((t) => t.dx === -2)).toBe(true);
  });
});

describe("salvage delivery timeline", () => {
  it("drops the ship from orbit on a slant, hovers while unloading, then climbs away", () => {
    expect(salvageShipAt(0).height).toBeCloseTo(SALVAGE_SHIP_ORBIT_HEIGHT);
    expect(salvageShipAt(0).offsetDy).toBeLessThan(-2);
    expect(salvageShipAt(100).heat).toBeGreaterThan(0.3);
    expect(salvageShipAt(SALVAGE_SHIP_DESCENT_MS).offsetDy).toBeCloseTo(0);
    expect(salvageShipAt(SALVAGE_SHIP_DESCENT_MS).legs).toBeCloseTo(1);
    expect(salvageShipAt(SALVAGE_SHIP_DESCENT_MS).heat).toBe(0);
    expect(salvageShipAt(SALVAGE_SHIP_DESCENT_MS).height).toBeCloseTo(SALVAGE_SHIP_HOVER_HEIGHT);
    expect(salvageShipAt(SALVAGE_MARCH_START_MS).rampOpen).toBeCloseTo(1);
    expect(salvageShipAt(SALVAGE_DEPART_START_MS).rampOpen).toBeCloseTo(0);
    expect(salvageShipAt(SALVAGE_DELIVERY_TOTAL_MS - 1).height).toBeGreaterThan(4);
    expect(salvageShipAt(SALVAGE_DELIVERY_TOTAL_MS).visible).toBe(false);
  });

  it("runs at a 1.5x stately pace", () => {
    expect(SALVAGE_PACE).toBe(1.5);
    expect(SALVAGE_DELIVERY_TOTAL_MS).toBeCloseTo(6_500 * 1.5);
  });

  it("marches each Ancillary down the ramp and out, fading as it disappears into the land", () => {
    const target = { dx: 2, dy: 2 };
    expect(salvageMarcherAt(target, 0, SALVAGE_MARCH_START_MS - 1).visible).toBe(false);
    const onRamp = salvageMarcherAt(target, 0, SALVAGE_MARCH_START_MS + 10 * SALVAGE_PACE);
    expect(onRamp.lift).toBeGreaterThan(0.3);
    const offRamp = salvageMarcherAt(target, 0, SALVAGE_MARCH_START_MS + SALVAGE_RAMP_WALK_MS);
    expect(offRamp.dy).toBeCloseTo(SALVAGE_RAMP_FOOT_DY, 1);
    const late = salvageMarcherAt(target, 0, SALVAGE_MARCH_START_MS + SALVAGE_RAMP_WALK_MS + 1600 * SALVAGE_PACE);
    expect(late.alpha).toBeLessThan(0.2);
    expect(late.dx).toBeGreaterThan(1.8);
    expect(salvageMarcherAt(target, SALVAGE_MARCHER_COUNT - 1, SALVAGE_DELIVERY_TOTAL_MS).visible).toBe(false);
  });
});

const fakeMarineTemplate = (): PopupMarineTemplate => {
  const bone = new Bone();
  const mesh = new SkinnedMesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  const root = new Group();
  root.add(mesh);
  return { root, clips: new Map([["PistolWalk", new AnimationClip("PistolWalk", 1, [])]]) };
};

describe("createSalvageDeliveryFxLayer", () => {
  const entry = { x: 1, y: 1, startedAt: 0, color: "#3366ff", marchers: salvageMarcherTargets({ x: 1, y: 1 }, () => false, { width: 50, height: 50 }) };

  it("lands the dropship, marches the game's marine down the ramp in the House's colour, and clears up", async () => {
    const scene = new Group();
    const layer = createSalvageDeliveryFxLayer(scene, undefined, () => Promise.resolve(fakeMarineTemplate()));
    layer.spawn(0, 0, 0, entry, 1_000, entry.marchers.map(() => 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    layer.update(1_000 + SALVAGE_MARCH_START_MS + 300);
    const deliveryGroup = layer.group.children[0]!;
    const marines: Object3D[] = [];
    deliveryGroup.traverse((o) => { if (o instanceof SkinnedMesh) marines.push(o); });
    expect(marines).toHaveLength(SALVAGE_MARCHER_COUNT);
    const walking = marines.filter((m) => m.parent!.parent!.visible);
    expect(walking.length).toBeGreaterThan(0);
    expect(((walking[0] as SkinnedMesh).material as MeshStandardMaterial).color.getHexString()).toBe("3366ff");
    expect(deliveryGroup.getObjectByName("salvage-dropship")?.visible).toBe(true);
    layer.update(1_000 + SALVAGE_DELIVERY_TOTAL_MS);
    expect(layer.group.children).toHaveLength(0);
    layer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("still flies the ship when the marine model has not loaded", () => {
    const layer = createSalvageDeliveryFxLayer(new Group(), undefined, () => new Promise(() => {}));
    layer.spawn(0, 0, 0, entry, 0, entry.marchers.map(() => 0));
    layer.update(SALVAGE_SHIP_DESCENT_MS / 2);
    expect(layer.group.getObjectByName("salvage-dropship")?.visible).toBe(true);
    layer.dispose();
  });
});
