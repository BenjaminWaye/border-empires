import { describe, expect, it } from "vitest";
import { Color, InstancedMesh, Matrix4, Quaternion, Scene, Vector3 } from "three";
import { SPARKS_PER_IMPACT } from "./popup-marine-bolts.js";
import { createShotRenderer, type ShotStyle } from "./popup-marine-shot-render.js";

const ATTACKER = "#4fb3ff";
const DEFENDER = "#ff5d5d";

// One marine a side, ten units apart, the attacker with a bolt halfway
// across and a fresh hit on the defender.
const fireOneShot = (attackerStyle?: ShotStyle) => {
  const scene = new Scene();
  const shots = createShotRenderer(scene, 1, 8);
  shots.beginFrame();
  shots.beginSide(0);
  shots.push(0, 0, 0, 0, [{ progress: 0.5, targetIndex: 0 }], [{ targetIndex: 0, age: 0.1 }]);
  shots.beginSide(1);
  shots.push(1, 10, 0, 0, [], []);
  shots.emit(1, ATTACKER, DEFENDER, attackerStyle);
  shots.commit();
  const [bolts, sparks] = scene.children as [InstancedMesh, InstancedMesh];
  return { bolts, sparks };
};

const colorAt = (mesh: InstancedMesh, i: number): Color => {
  const c = new Color();
  mesh.getColorAt(i, c);
  return c;
};

const scaleAt = (mesh: InstancedMesh, i: number): Vector3 => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  const s = new Vector3();
  m.decompose(new Vector3(), new Quaternion(), s);
  return s;
};

describe("createShotRenderer", () => {
  it("draws a standard round as one team-coloured tracer", () => {
    const { bolts } = fireOneShot();
    expect(bolts.count).toBe(1);
    expect(colorAt(bolts, 0).getHexString()).toBe(new Color(ATTACKER).getHexString());
  });

  it("draws an Umbrite round as a wide orange glow around a narrower violet core", () => {
    const { bolts } = fireOneShot({ umbrite: true });
    expect(bolts.count).toBe(2);
    const glow = colorAt(bolts, 0);
    const core = colorAt(bolts, 1);
    expect(glow.r).toBeGreaterThan(glow.b);
    expect(core.b).toBeGreaterThan(core.g);
    expect(scaleAt(bolts, 0).x).toBeGreaterThan(scaleAt(bolts, 1).x);
    expect(scaleAt(bolts, 1).x).toBeGreaterThan(1);
  });

  it("bursts an Umbrite hit into larger orange embers instead of team-coloured sparks", () => {
    const plain = fireOneShot().sparks;
    const umbrite = fireOneShot({ umbrite: true }).sparks;
    expect(umbrite.count).toBe(SPARKS_PER_IMPACT);
    const ember = colorAt(umbrite, 0);
    expect(ember.r).toBeGreaterThan(ember.b);
    expect(scaleAt(umbrite, 0).x).toBeGreaterThan(scaleAt(plain, 0).x);
  });
});
