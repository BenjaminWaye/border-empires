import { afterEach, describe, expect, it, vi } from "vitest";

const runTownFocusPick = vi.fn();
const stepTown = vi.fn();
vi.mock("./client-hud-v2-town-runtime.js", () => ({ runTownFocusPick, stepTown }));
const screen = { id: "town" as string };
vi.mock("./client-hud-v2-context.js", () => ({ screen }));

const { onTownKey } = await import("./client-hud-v2-town-keys.js");
const deps = {} as Parameters<typeof onTownKey>[0];
const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({ key: k, target: null, altKey: false, ctrlKey: false, metaKey: false, ...extra });

describe("town screen keys", () => {
  afterEach(() => { runTownFocusPick.mockClear(); stepTown.mockClear(); screen.id = "town"; });

  it("1–4 pick Balanced, Growth, Levy, Commerce", () => {
    expect(onTownKey(deps, key("3"))).toBe(true);
    expect(runTownFocusPick).toHaveBeenCalledWith(deps, "LEVY");
  });

  it("arrows step between towns", () => {
    onTownKey(deps, key("ArrowLeft"));
    onTownKey(deps, key("ArrowRight"));
    expect(stepTown.mock.calls.map((c) => c[1])).toEqual([-1, 1]);
  });

  it("does nothing outside the town screen or with a modifier", () => {
    screen.id = "map";
    expect(onTownKey(deps, key("1"))).toBe(false);
    screen.id = "town";
    expect(onTownKey(deps, key("1", { ctrlKey: true }))).toBe(false);
    expect(runTownFocusPick).not.toHaveBeenCalled();
  });
});
