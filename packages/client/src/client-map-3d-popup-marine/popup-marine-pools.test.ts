import { describe, expect, it, vi } from "vitest";
import { Group, Scene } from "three";

// Each "model" is a bare group; the slot module is stubbed so a slot just
// remembers which model it was built from.
const loaders: Record<string, { resolve: () => void; promise: Promise<{ root: Group; clips: Map<string, never> }> }> = {};
const deferred = (model: string) => {
  let resolve!: () => void;
  const promise = new Promise<{ root: Group; clips: Map<string, never> }>((res) => {
    resolve = () => res({ root: new Group(), clips: new Map<string, never>() });
  });
  loaders[model] = { resolve, promise };
  return promise;
};

vi.mock("./popup-marine-asset.js", () => ({
  loadPopupMarineTemplate: (model: string = "standard") => loaders[model]?.promise ?? deferred(model)
}));
vi.mock("./popup-marine-slot.js", () => ({
  createMarineSlot: (_scene: Scene, _template: unknown, _index: number, model = "standard") => ({ root: new Group(), model }),
  disposeMarineSlot: () => {}
}));

const { createMarinePools } = await import("./popup-marine-pools.js");

const flush = () => new Promise((res) => setTimeout(res, 0));

describe("createMarinePools", () => {
  it("serves a titanium squad from the standard pool until the heavy armour has loaded, then from the heavy pool", async () => {
    const pools = createMarinePools(new Scene(), 4);
    loaders.standard!.resolve();
    await flush();

    pools.beginFrame();
    const early = pools.acquire(0, "heavy") as unknown as { model: string };
    expect(early.model).toBe("standard");

    loaders.heavy!.resolve();
    await flush();
    pools.beginFrame();
    const later = pools.acquire(0, "heavy") as unknown as { model: string };
    expect(later.model).toBe("heavy");
  });

  it("caps each side's pool per model at its capacity", async () => {
    const pools = createMarinePools(new Scene(), 2);
    loaders.standard!.resolve();
    await flush();
    pools.beginFrame();
    expect(pools.acquire(1, "standard")).toBeDefined();
    expect(pools.acquire(1, "standard")).toBeDefined();
    expect(pools.acquire(1, "standard")).toBeUndefined();
    // The other side has its own pool.
    expect(pools.acquire(0, "standard")).toBeDefined();
  });
});
