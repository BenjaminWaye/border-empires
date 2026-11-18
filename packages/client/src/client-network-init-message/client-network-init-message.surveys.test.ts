// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { occupationSurveyController } from "../client-occupation-survey.js";
import { resetFullscreenCardQueueForTests } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";
import { resetWaystationPopupGateForTests } from "../client-waystation-activation/client-waystation-activation-gate.js";
import { hasWaystationActivationBeenShown } from "../client-waystation-activation/client-waystation-activation-catchup.js";
import { bind, createState, FakeWebSocket } from "./client-network-test-harness.js";

// Logging back in stacked a Waystation Activated card and a Town survey card for
// things that happened while the player was away. A login's INIT backfill is now
// quiet (the Chronicle has both); an in-place reconnect still shows cards for
// what landed while the socket was down.

const survey = (id: string, resource: "TITANIUM" | "GEMS", occurredAt = Date.now()) => ({
  id, type: "OCCUPATION_SURVEY", occurredAt,
  text: `${resource} nearby`, surveyResource: resource,
  surveySignature: resource === "TITANIUM" ? "FERROUS_DUST" : "REFRACTIVE_GROUND",
  surveyX: 17, surveyY: 9, bearing: "west", distanceBand: "NEAR", confidence: "HIGH"
});
const activation = (id: string, x: number, y: number) => ({
  id, type: "WAYSTATION_ACTIVATED", occurredAt: Date.now(), text: "A waystation was activated.",
  x, y, grantedEffect: "RESOURCE_TILE", grantedResource: "FOOD"
});
const init = (playerId: string, eventLog: unknown[]) => ({ data: JSON.stringify({
  type: "INIT",
  player: { id: playerId, name: "Survey Player", points: 5, homeTile: { x: 10, y: 10 }, techIds: [], eventLog },
  config: { season: { seasonId: "quiet-login-season", worldSeed: 12345 } },
  recovery: { nextClientSeq: 1, pendingCommands: [] }
}) });
const sync = (): void => occupationSurveyController.sync(
  { camX: 10, camY: 10, camSubX: 0, camSubY: 0, selected: undefined },
  () => ({ sx: 0, sy: 0 }), 32, 16, 16
);
const surveyDialog = (): Element | null => document.querySelector(".occupation-survey-overlay");
const waystationCard = (): Element | null => document.getElementById("waystation-activation-overlay");

const reset = (): void => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  resetFullscreenCardQueueForTests();
  resetWaystationPopupGateForTests();
  occupationSurveyController.beginCapture();
  occupationSurveyController.endCapture([]);
  occupationSurveyController.reconcile([], []);
};
beforeEach(reset);
afterEach(reset);

describe("INIT event-log backfill", () => {
  it("does not pop survey or waystation cards on login, but keeps the clue", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    const oldSurvey = survey("old-standing-survey", "TITANIUM", Date.now() - 2 * 24 * 60 * 60 * 1000);
    ws.emit("message", init("login-player", [oldSurvey, activation("waystation-1", 458, 288)]));
    sync();
    expect(surveyDialog()).toBeNull();
    expect(waystationCard()).toBeNull();
    expect(occupationSurveyController.currentForResource("TITANIUM")?.id).toBe("old-standing-survey");
    expect(hasWaystationActivationBeenShown({ me: "login-player" }, 458, 288)).toBe(true);
  });

  it("still shows cards for entries that land during an in-place reconnect", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    const loginLog = [survey("login-survey", "TITANIUM"), activation("waystation-1", 1, 1)];
    ws.emit("message", init("reconnect-player", loginLog));
    sync();
    expect(surveyDialog()).toBeNull();
    expect(waystationCard()).toBeNull();

    ws.emit("message", init("reconnect-player", [...loginLog, activation("waystation-2", 2, 2)]));
    expect(waystationCard()?.textContent).toContain("(2, 2)");
    document.querySelector<HTMLButtonElement>("#waystation-activation-close")?.click();

    ws.emit("message", init("reconnect-player", [...loginLog, activation("waystation-2", 2, 2), survey("reconnect-survey", "GEMS")]));
    sync();
    expect(surveyDialog()?.textContent).toContain("Signs of Crystal nearby");
    expect(waystationCard()).toBeNull();
  });
});
