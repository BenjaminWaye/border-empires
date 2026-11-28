import { describe, expect, it, vi } from "vitest";
import { DirectionalLight, PerspectiveCamera, Scene } from "three";
import {
  SLOW_GPU_MEMORY_MS,
  SLOW_GPU_STORAGE_KEY,
  createFrameGovernor,
  createSlowFrameDetector,
  rememberedSlowGpu
} from "./client-map-3d-frame-governor.js";

vi.mock("../client-debug/client-debug.js", () => ({ recordClientDebugEvent: vi.fn() }));

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  } as Storage;
};

/** Frame start times from bug report bc313812: ~310 ms GPU-bound frames, back to back. */
const reportCadence = (from: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => from + i * 320);

const fakeRenderer = (pixelRatio: number) => {
  let ratio = pixelRatio;
  return {
    render: vi.fn(),
    setPixelRatio: vi.fn((value: number) => {
      ratio = value;
    }),
    getPixelRatio: () => ratio,
    shadowMap: { enabled: true }
  };
};

const sceneWithSun = (): { scene: Scene; sun: DirectionalLight } => {
  const scene = new Scene();
  const sun = new DirectionalLight();
  sun.castShadow = true;
  scene.add(sun);
  return { scene, sun };
};

describe("slow 3D frame detector", () => {
  it("flags the report's sustained ~3 fps cadence", () => {
    const detector = createSlowFrameDetector();
    const results = reportCadence(10_000, 20).map((at) => detector.record(at, false));
    expect(results.some(Boolean)).toBe(true);
  });

  it("also flags a device far slower than the report (~1 fps)", () => {
    const detector = createSlowFrameDetector();
    const results = Array.from({ length: 8 }, (_, i) => detector.record(i * 900, false));
    expect(results.some(Boolean)).toBe(true);
  });

  it("ignores a smooth 60 fps device with occasional rebuild hitches", () => {
    const detector = createSlowFrameDetector();
    let at = 0;
    for (let i = 0; i < 600; i += 1) {
      at += i % 60 === 0 ? 300 : 16.7;
      expect(detector.record(at, false)).toBe(false);
    }
  });

  it("never fires while the load / foreground warm-up hold is active", () => {
    const detector = createSlowFrameDetector();
    expect(reportCadence(0, 40).some((at) => detector.record(at, true))).toBe(false);
  });

  it("treats a backgrounded gap as a fresh start, not a slow frame", () => {
    const detector = createSlowFrameDetector();
    const fired = [0, 16, 33, 5_000, 5_016, 5_033, 5_050].map((at) => detector.record(at, false));
    expect(fired.some(Boolean)).toBe(false);
  });
});

describe("3D frame governor", () => {
  it("drops to 1x and turns shadows off once frames are sustained slow, and remembers it", () => {
    const renderer = fakeRenderer(2);
    const storage = memoryStorage();
    const { scene, sun } = sceneWithSun();
    const governor = createFrameGovernor({ renderer, startDemoted: false, isHeld: () => false, storage, wallNow: () => 1_000 });
    for (const at of reportCadence(10_000, 20)) governor.renderFrame(scene, new PerspectiveCamera(), at);

    expect(governor.demoted()).toBe(true);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(sun.castShadow).toBe(false);
    expect(storage.getItem(SLOW_GPU_STORAGE_KEY)).toBe("1000");
    expect(renderer.render).toHaveBeenCalledTimes(20);
  });

  it("keeps full quality on a device rendering smoothly", () => {
    const renderer = fakeRenderer(2);
    const { scene, sun } = sceneWithSun();
    const governor = createFrameGovernor({ renderer, startDemoted: false, isHeld: () => false, storage: memoryStorage() });
    for (let i = 0; i < 600; i += 1) governor.renderFrame(scene, new PerspectiveCamera(), i * 16.7);
    expect(governor.demoted()).toBe(false);
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(sun.castShadow).toBe(true);
  });

  it("a remembered demotion clears the sun's shadow on the first frame", () => {
    const renderer = fakeRenderer(1);
    const { scene, sun } = sceneWithSun();
    const governor = createFrameGovernor({ renderer, startDemoted: true, isHeld: () => false, storage: memoryStorage() });
    governor.renderFrame(scene, new PerspectiveCamera(), 0);
    expect(sun.castShadow).toBe(false);
    expect(renderer.shadowMap.enabled).toBe(false);
  });

  it("remembers a demotion for a week", () => {
    const storage = memoryStorage();
    storage.setItem(SLOW_GPU_STORAGE_KEY, "1000");
    expect(rememberedSlowGpu(1000 + SLOW_GPU_MEMORY_MS - 1, storage)).toBe(true);
    expect(rememberedSlowGpu(1000 + SLOW_GPU_MEMORY_MS, storage)).toBe(false);
    expect(rememberedSlowGpu(0, memoryStorage())).toBe(false);
  });
});
