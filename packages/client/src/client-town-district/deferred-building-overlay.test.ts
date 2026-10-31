import { describe, expect, it, vi } from "vitest";
import { createDeferredBuildingOverlay } from "./deferred-building-overlay.js";

describe("unused dedicated model buffers", () => {
  it("does not create superseded overlays for lifecycle calls, but preserves explicit demo placement", () => {
    const addInstance = vi.fn<(x: number, label?: string) => void>();
    const inner = { addInstance, clear: vi.fn(), commit: vi.fn(), update: vi.fn(), dispose: vi.fn(), constructionBoundaryPassed: () => true };
    const create = vi.fn(() => inner), overlay = createDeferredBuildingOverlay(create);
    overlay.clear(); overlay.commit(); overlay.update(100); overlay.dispose();
    expect(overlay.constructionBoundaryPassed()).toBe(false);
    expect(create).not.toHaveBeenCalled();
    overlay.addInstance(4, "demo"); overlay.addInstance(5);
    expect(create).toHaveBeenCalledTimes(1);
    expect(addInstance).toHaveBeenCalledWith(4, "demo");
    overlay.clear(); overlay.commit(); overlay.update(200);
    expect(inner.update).toHaveBeenCalledWith(200);
    expect(overlay.constructionBoundaryPassed()).toBe(true);
    overlay.dispose(); expect(inner.dispose).toHaveBeenCalledOnce();
  });
});
