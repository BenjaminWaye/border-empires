// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { occupationSurveyController } from "../client-occupation-survey.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import { createPersistentAlertsFrame, type PersistentAlertsFrameDrawDeps } from "./client-persistent-alerts-frame.js";

const noop = (): undefined => undefined;
const drawDeps: PersistentAlertsFrameDrawDeps = {
  ctx: new Proxy({}, { get: () => noop, set: () => true }) as unknown as CanvasRenderingContext2D,
  canvas: { width: 100, height: 100 } as HTMLCanvasElement,
  worldToScreen: () => ({ sx: 0, sy: 0 }),
  toroidDelta: (from, to) => to - from,
  size: 1,
  halfW: 0,
  halfH: 0
};

const surveyEntry = {
  id: "survey-gate-1",
  type: "OCCUPATION_SURVEY",
  text: "Ferrous dust north of this town indicates likely Titanium-bearing territory.",
  surveyResource: "TITANIUM" as const,
  surveySignature: "FERROUS_DUST" as const,
  surveyX: 14,
  surveyY: 10,
  bearing: "north",
  distanceBand: "NEAR" as const,
  confidence: "HIGH" as const
};

const signedInState = (): ClientState => {
  const state = createInitialState();
  state.me = "me";
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  return state;
};

const popupVisible = (): boolean => document.querySelector(".occupation-survey-overlay") !== null;

describe("createPersistentAlertsFrame town survey popup", () => {
  afterEach(() => occupationSurveyController.reconcile([], [], `reset-${crypto.randomUUID()}`));

  it("holds the survey popup while What's New is open and shows it once closed", () => {
    const state = signedInState();
    state.changelog.open = true;
    const frame = createPersistentAlertsFrame(state);
    occupationSurveyController.reconcile([surveyEntry], [], "me:season-a");
    frame(1, drawDeps);
    expect(popupVisible()).toBe(false);
    state.changelog.open = false;
    frame(2, drawDeps);
    expect(popupVisible()).toBe(true);
  });

  it("hides an already-shown survey popup when the Activity dashboard opens over it", () => {
    const state = signedInState();
    const frame = createPersistentAlertsFrame(state);
    occupationSurveyController.reconcile([surveyEntry], [], "me:season-b");
    frame(1, drawDeps);
    expect(popupVisible()).toBe(true);
    state.activityDashboard.open = true;
    frame(2, drawDeps);
    expect(popupVisible()).toBe(false);
    state.activityDashboard.open = false;
    frame(3, drawDeps);
    expect(popupVisible()).toBe(true);
  });
});
