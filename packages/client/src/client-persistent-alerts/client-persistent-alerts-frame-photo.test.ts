// @vitest-environment happy-dom
// 2026-11-14 playtest: photo-mode shots kept the "!" alert pin. Both renderers draw the pins in this frame step.
import { afterEach, describe, expect, it, vi } from "vitest";

const draw = vi.hoisted(() => vi.fn());
vi.mock("./client-persistent-alerts.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client-persistent-alerts.js")>()),
  drawPersistentAlertLocators: draw
}));

import { createInitialState } from "../client-state/client-state.js";
import { PHOTO_MODE_BODY_CLASS } from "../client-photo-mode/client-photo-mode.js";
import { createPersistentAlertsFrame, type PersistentAlertsFrameDrawDeps } from "./client-persistent-alerts-frame.js";

const deps = { canvas: { width: 100, height: 100 }, worldToScreen: () => ({ sx: 0, sy: 0 }), toroidDelta: (a: number, b: number) => b - a, size: 1, halfW: 0, halfH: 0 } as unknown as PersistentAlertsFrameDrawDeps;

describe("persistent alert pins in photo mode", () => {
  afterEach(() => {
    document.body.className = "";
    draw.mockClear();
  });

  it("are not drawn while photo mode is on, and are drawn again after", () => {
    const frame = createPersistentAlertsFrame(createInitialState());
    document.body.classList.add(PHOTO_MODE_BODY_CLASS);
    frame(1, deps);
    expect(draw).not.toHaveBeenCalled();
    document.body.classList.remove(PHOTO_MODE_BODY_CLASS);
    frame(2, deps);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  // Review of #2786: skipping the draw left last frame's tap areas, so a tap hit an invisible pin.
  it("clears the pins' tap areas while photo mode is on", () => {
    const state = createInitialState();
    state.persistentAlertLocators = [{ x: 0, y: 0 } as unknown as (typeof state.persistentAlertLocators)[number]];
    const frame = createPersistentAlertsFrame(state);
    document.body.classList.add(PHOTO_MODE_BODY_CLASS);
    frame(1, deps);
    expect(state.persistentAlertLocators).toEqual([]);
  });
});
