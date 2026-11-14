import { AdditiveBlending, Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type Camera, type Scene } from "three";
import { makeGlowTexture } from "./client-map-3d-scout-drone-textures.js";

// Short light trails behind the scout drone's two wingtip nav lights: a ring buffer of recent
// positions per light, drawn as camera-facing glow quads that shrink and fade with age. One
// instanced draw call for both trails; the buffers are allocated once. Samples are stored
// relative to the map (scene position minus the camera's scene offset) so panning the camera
// does not smear them.

const SAMPLES = 22;
const SAMPLE_EVERY_MS = 45;
const HEAD_SIZE = 0.06;

export type ScoutTrails = {
  /**
   * Records the lights' current scene positions (sampled at a fixed rate) and redraws.
   * `offsetX`/`offsetZ` is this frame's scene-minus-map offset (constant across the view).
   */
  readonly update: (nowMs: number, left: Vector3, right: Vector3, offsetX: number, offsetZ: number, camera: Camera | undefined, strength: number) => void;
  readonly reset: () => void;
  readonly setVisible: (visible: boolean) => void;
  readonly dispose: () => void;
};

export const createScoutTrails = (scene: Scene, leftColor: Color, rightColor: Color): ScoutTrails => {
  const texture = makeGlowTexture();
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({ toneMapped: false, map: texture, color: "#ffffff", transparent: true, blending: AdditiveBlending, depthWrite: false });
  const mesh = new InstancedMesh(geometry, material, SAMPLES * 2);
  mesh.name = "scout-drone-trails";
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  const history = [new Float32Array(SAMPLES * 3), new Float32Array(SAMPLES * 3)];
  let head = 0;
  let filled = 0;
  let lastSampleAt = -Infinity;
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const facing = new Quaternion();
  const tint = new Color();
  const colors = [leftColor, rightColor];

  const write = (buffer: Float32Array, at: Vector3, offsetX: number, offsetZ: number): void => {
    buffer[head * 3] = at.x - offsetX;
    buffer[head * 3 + 1] = at.y;
    buffer[head * 3 + 2] = at.z - offsetZ;
  };

  const update: ScoutTrails["update"] = (nowMs, left, right, offsetX, offsetZ, camera, strength) => {
    if (nowMs - lastSampleAt >= SAMPLE_EVERY_MS) {
      lastSampleAt = nowMs;
      head = (head + 1) % SAMPLES;
      write(history[0]!, left, offsetX, offsetZ);
      write(history[1]!, right, offsetX, offsetZ);
      filled = Math.min(SAMPLES, filled + 1);
    }
    if (camera) facing.copy(camera.quaternion);
    let count = 0;
    for (let side = 0; side < 2; side += 1) {
      const buffer = history[side]!;
      for (let age = 0; age < filled; age += 1) {
        const slot = (head - age + SAMPLES) % SAMPLES;
        const fade = 1 - age / SAMPLES;
        position.set(buffer[slot * 3]! + offsetX, buffer[slot * 3 + 1]!, buffer[slot * 3 + 2]! + offsetZ);
        const size = HEAD_SIZE * (0.35 + 0.65 * fade);
        matrix.compose(position, facing, scale.set(size, size, size));
        mesh.setMatrixAt(count, matrix);
        mesh.setColorAt(count, tint.copy(colors[side]!).multiplyScalar(fade * fade * fade * 0.7 * strength));
        count += 1;
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return {
    update,
    reset: () => {
      filled = 0;
      mesh.count = 0;
    },
    setVisible: (visible) => {
      mesh.visible = visible;
    },
    dispose: () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    }
  };
};
