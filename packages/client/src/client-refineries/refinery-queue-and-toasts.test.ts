// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { persistDevelopmentQueueForPlayer, restorePersistedDevelopmentQueueForPlayer } from "../client-development-queue/client-development-queue.js";
import { sendDevelopmentBuild } from "../client-queue-logic/client-queue-logic.js";
import { createInitialState } from "../client-state/client-state.js";
import { refineryBuildPayload } from "./refinery-commands.js";
import { REFINERY_FIXTURE_ME, REFINERY_FIXTURE_RIVAL, placeRefineryFixture, refineryFixtureGrid } from "./refinery-fixtures.js";
import { REFINERY_TOAST_TEXT, createRefineryFieldToasts, refineryToastFor } from "./refinery-field-toasts.js";

describe("a refinery build in the development queue", () => {
  it("keeps its chosen field across a reload and sends it when it leaves the queue", () => {
    persistDevelopmentQueueForPlayer("me", [{ kind: "BUILD", x: 101, y: 100, tileKey: "101,100", label: "Titanium Refinery at (101, 100)",
      optimisticKind: "TITANIUM_REFINERY", payload: refineryBuildPayload("TITANIUM_REFINERY", { x: 101, y: 100 }, { x: 106, y: 99 }) }]);
    const [restored] = restorePersistedDevelopmentQueueForPlayer("me", new Map());
    expect(restored).toMatchObject({ kind: "BUILD", payload: { structureType: "TITANIUM_REFINERY", fieldX: 106, fieldY: 99 } });

    const state = createInitialState();
    const sent: unknown[] = [];
    sendDevelopmentBuild(state, refineryBuildPayload("TITANIUM_REFINERY", { x: 101, y: 100 }, { x: 106, y: 99 }), () => undefined,
      { x: 101, y: 100, label: "Titanium Refinery", optimisticKind: "TITANIUM_REFINERY" }, {
        keyFor: (x, y) => `${x},${y}`, queueDevelopmentAction: () => false, developmentSlotSummary: () => ({ busy: 0, limit: 3, available: 3 }),
        developmentSlotReason: () => "", renderHud: () => undefined, sendGameMessage: (payload) => { sent.push(payload); return true; },
        pushFeed: () => undefined, showCaptureAlert: () => undefined
      });
    expect(sent).toEqual([{ type: "BUILD_ECONOMIC_STRUCTURE", x: 101, y: 100, structureType: "TITANIUM_REFINERY", fieldX: 106, fieldY: 99 }]);
  });
});

describe("needs-a-field toasts", () => {
  const view = (tiles: ReturnType<typeof refineryFixtureGrid>, me = REFINERY_FIXTURE_ME, tilesRevision = 1) => ({ tiles, tilesRevision, me });

  it("shows for your active refinery without a field or with a broken link, never for a working one or a rival's", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    expect(refineryToastFor(view(tiles), refinery)).toBeUndefined();
    for (let y = 95; y <= 105; y += 1) Object.assign(tiles.get(`104,${y}`)!, { ownerId: REFINERY_FIXTURE_RIVAL, ownershipState: "SETTLED" });
    expect(refineryToastFor(view(tiles, REFINERY_FIXTURE_ME, 2), refinery)).toMatchObject({ reason: "UNLINKED", text: REFINERY_TOAST_TEXT.UNLINKED });
    expect(refineryToastFor(view(tiles, REFINERY_FIXTURE_RIVAL, 2), refinery)).toBeUndefined();
    const unassigned = placeRefineryFixture(tiles, 99, 100, "TITANIUM_REFINERY");
    expect(refineryToastFor(view(tiles, REFINERY_FIXTURE_ME, 3), unassigned)?.text).toBe("Needs a field");
  });

  it("renders a tappable toast in the map's plate layer that opens the field picker", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY");
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 600;
    host.append(canvas); document.body.append(host);
    canvas.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    const state = { tiles, tilesRevision: 1, me: REFINERY_FIXTURE_ME, authSessionReady: true, profileSetupRequired: false, selected: undefined as { x: number; y: number } | undefined };
    const openPicker = vi.fn(() => true);
    const toasts = createRefineryFieldToasts(canvas, state, openPicker);
    toasts.render([{ wx: 101, wy: 100, wk: "101,100", px: 300, py: 300, vis: "visible", t: refinery }], { size: 48, project: () => ({ sx: 0, sy: 0 }) });
    const button = host.querySelector<HTMLButtonElement>(".refinery-toast")!;
    expect(button.textContent).toBe("Needs a field");
    button.click();
    expect(openPicker).toHaveBeenCalledWith(refinery);
    expect(state.selected).toEqual({ x: 101, y: 100 });
    // Once the refinery has a linked field the toast goes.
    refinery.economicStructure!.refineryField = { x: 106, y: 99, assignedAt: 1 };
    state.tilesRevision = 2;
    toasts.render([{ wx: 101, wy: 100, wk: "101,100", px: 300, py: 300, vis: "visible", t: refinery }], { size: 48, project: () => ({ sx: 0, sy: 0 }) });
    expect(host.querySelector(".refinery-toast")).toBeNull();
    toasts.dispose();
  });
});
