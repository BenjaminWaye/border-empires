// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { occupationSurveyController } from "../client-occupation-survey.js";
import { bind, createState, FakeWebSocket } from "./client-network-test-harness.js";

afterEach(() => {
  occupationSurveyController.beginCapture();
  occupationSurveyController.endCapture([]);
  occupationSurveyController.reconcile([], []);
});

describe("INIT survey restoration", () => {
  it("opens an unresolved report older than the retiring feed's 24-hour window", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    ws.emit("message", { data: JSON.stringify({
      type: "INIT",
      player: {
        id: "survey-player", name: "Survey Player", points: 5, homeTile: { x: 10, y: 10 }, techIds: [],
        eventLog: [{
          id: "old-standing-survey", type: "OCCUPATION_SURVEY", occurredAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
          text: "Ferrous dust east of this town indicates likely Titanium-bearing territory.",
          surveyResource: "TITANIUM", surveySignature: "FERROUS_DUST", surveyX: 17, surveyY: 9,
          bearing: "east", distanceBand: "NEAR", confidence: "HIGH"
        }]
      },
      config: { season: { seasonId: "survey-season", worldSeed: 12345 } },
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    }) });
    occupationSurveyController.sync(
      { camX: 10, camY: 10, camSubX: 0, camSubY: 0, selected: undefined },
      () => ({ sx: -1000, sy: -1000 }), 32, 16, 16
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Signs of Titanium nearby");
  });
});
