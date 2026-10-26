import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo } from "../client-types.js";
import { manifestAffordable, manifestNodeState } from "./client-hud-v2-manifest.js";
import { hudV2GameOnScreen } from "./client-hud-v2-ready.js";

const body = (classes: string[] = []) => ({ classList: { contains: (c: string) => classes.includes(c) } }) as unknown as HTMLElement;

const inGame = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.hasEverInitialized = true;
  state.firstChunkAt = 1;
  return state;
};

describe("HUD v2 waits for the game to be on screen", () => {
  it("shows once signed in with the map loaded", () => {
    expect(hudV2GameOnScreen(inGame(), body())).toBe(true);
  });

  // Regression: the HUD drew over the "Drawing your map" loading screen when joining.
  it("stays hidden while the map is being prepared after sign-in", () => {
    const state = inGame();
    state.mapPrep = { stage: "shaders" } as unknown as typeof state.mapPrep;
    expect(hudV2GameOnScreen(state, body())).toBe(false);
  });

  it("stays hidden before the first map load, during season join and in the lobby", () => {
    const first = inGame();
    first.firstChunkAt = 0;
    expect(hudV2GameOnScreen(first, body())).toBe(false);
    const joining = inGame();
    joining.needsSeasonJoin = true;
    joining.joinSeasonOverlayOpen = true;
    expect(hudV2GameOnScreen(joining, body())).toBe(false);
    expect(hudV2GameOnScreen(inGame(), body(["season-lobby-active"]))).toBe(false);
    const signedOut = inGame();
    signedOut.authSessionReady = false;
    expect(hudV2GameOnScreen(signedOut, body())).toBe(false);
  });
});

describe("Manifest availability vs affordability", () => {
  const tech = (id: string, canResearch: boolean | undefined, prereqIds: string[] = []): TechInfo => ({
    id, name: id, tier: 1, branch: "economy", prereqIds, description: "", mods: {}, requirements: { gold: 40, resources: {}, ...(canResearch === undefined ? {} : { canResearch }) }
  });

  // Regression: canResearch is "a current choice AND affordable", so every Manifest you couldn't pay for showed Locked.
  it("shows a current choice you can't afford as available, not locked", () => {
    const choices = new Set(["a"]);
    expect(manifestNodeState(tech("a", false), new Set(), choices)).toBe("available");
    expect(manifestAffordable(tech("a", false), 0)).toBe(false);
    expect(manifestNodeState(tech("b", false), new Set(), choices)).toBe("locked");
  });

  it("falls back to prerequisites before the choice list arrives", () => {
    expect(manifestNodeState(tech("a", undefined), new Set(), new Set())).toBe("available");
    expect(manifestNodeState(tech("c", undefined, ["x"]), new Set(), new Set())).toBe("locked");
    expect(manifestAffordable(tech("a", undefined), 40)).toBe(true);
  });
});
