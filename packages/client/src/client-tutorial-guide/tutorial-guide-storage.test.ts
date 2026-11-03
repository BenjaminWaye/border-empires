// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { registerHintStateSender } from "../client-discovery-tips/client-hint-server-sync.js";
import {
  hydrateGuideFromServer,
  hydrateTutorialGuideFromInit,
  isGuideActive,
  markGuideStepsCompleted,
  readGuideProgress,
  resetGuideStorageMemoryForTests,
  restartGuide,
  setGuideStatus
} from "./tutorial-guide-storage.js";

const EMAIL = "guide@example.com";
let sent: Array<Record<string, unknown>>;

beforeEach(() => {
  window.localStorage.clear();
  resetGuideStorageMemoryForTests();
  sent = [];
  registerHintStateSender((patch) => sent.push(patch));
});

describe("tutorial guide enrollment (new accounts only)", () => {
  it("enrolls a brand-new account (profile still needs setup) and tells the server", () => {
    hydrateTutorialGuideFromInit({ guideStatus: "", guideSteps: [], profileNeedsSetup: true, onboardingChecklistCompleted: false }, EMAIL);
    expect(isGuideActive(EMAIL)).toBe(true);
    expect(sent).toEqual([{ guideStatus: "active", guideSteps: [] }]);
  });

  it("never enrolls an existing account", () => {
    hydrateTutorialGuideFromInit({ guideStatus: "", guideSteps: [], profileNeedsSetup: false, onboardingChecklistCompleted: false }, EMAIL);
    hydrateTutorialGuideFromInit({ guideStatus: "", guideSteps: [], profileNeedsSetup: true, onboardingChecklistCompleted: true }, "veteran@example.com");
    expect(isGuideActive(EMAIL)).toBe(false);
    expect(isGuideActive("veteran@example.com")).toBe(false);
    expect(sent).toEqual([]);
  });

  it("keeps a stored server status on later logins (profile complete by then)", () => {
    hydrateTutorialGuideFromInit({ guideStatus: "active", guideSteps: ["look-pan"], profileNeedsSetup: false }, EMAIL);
    expect(readGuideProgress(EMAIL)).toEqual({ status: "active", steps: ["look-pan"] });
    hydrateTutorialGuideFromInit({ guideStatus: "dismissed", guideSteps: ["look-pan"], profileNeedsSetup: false }, EMAIL);
    expect(isGuideActive(EMAIL)).toBe(false);
  });
});

describe("tutorial guide progress", () => {
  it("persists completed steps once and mirrors them to the server", () => {
    setGuideStatus("active", EMAIL);
    expect(markGuideStepsCompleted(["look-pan"], EMAIL)).toBe(true);
    expect(markGuideStepsCompleted(["look-pan"], EMAIL)).toBe(false);
    expect(sent.at(-1)).toEqual({ guideStatus: "active", guideSteps: ["look-pan"] });
    resetGuideStorageMemoryForTests();
    expect(readGuideProgress(EMAIL).steps).toEqual(["look-pan"]); // survives a reload via localStorage
  });

  it("unions steps finished offline with the server copy and resends them", () => {
    setGuideStatus("active", EMAIL);
    markGuideStepsCompleted(["look-zoom"], EMAIL);
    sent = [];
    hydrateGuideFromServer("active", ["look-pan"], EMAIL);
    expect(readGuideProgress(EMAIL).steps).toEqual(["look-pan", "look-zoom"]);
    expect(sent).toEqual([{ guideStatus: "active", guideSteps: ["look-pan", "look-zoom"] }]);
  });

  it("a device with stale finished progress does not undo a Restart made elsewhere", () => {
    setGuideStatus("done", EMAIL);
    markGuideStepsCompleted(["look-pan", "look-zoom"], EMAIL);
    sent = [];
    hydrateGuideFromServer("active", [], EMAIL); // restarted on another device
    expect(readGuideProgress(EMAIL)).toEqual({ status: "active", steps: [] });
    expect(sent).toEqual([]);
  });

  it("restart clears progress and reactivates", () => {
    setGuideStatus("done", EMAIL);
    markGuideStepsCompleted(["look-pan"], EMAIL);
    restartGuide(EMAIL);
    expect(readGuideProgress(EMAIL)).toEqual({ status: "active", steps: [] });
  });

  it("scopes progress per account", () => {
    setGuideStatus("active", EMAIL);
    expect(isGuideActive("other@example.com")).toBe(false);
  });
});
