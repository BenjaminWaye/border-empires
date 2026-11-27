// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { RelicMapHint } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import { relicPlatePassesTaps } from "./relic-site-plate-model.js";
import { createRelicSitePlates } from "./relic-site-plates.js";

const stateWith = (hint: RelicMapHint): ClientState => ({
  me: "me", meName: "Me", playerNames: new Map(), leaderboard: { overall: [], byTiles: [], byIncome: [], bySettledTiles: [], byTechs: [] }, playerColors: new Map(),
  relicMapHints: new Map([[`${hint.x},${hint.y}`, hint]]), tiles: new Map(),
  camX: hint.x, camY: hint.y, camSubX: 0, camSubY: 0,
  authSessionReady: true, profileSetupRequired: false,
  scoutDronePicking: { active: false }, marchOriginPicking: { active: false }, musterMarchTargeting: { active: false }
}) as unknown as ClientState;

const renderPlate = (hint: RelicMapHint, three: boolean): HTMLElement => {
  setTrue3DRendererActive(three);
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  host.append(canvas); document.body.append(host);
  const plates = createRelicSitePlates(canvas, stateWith(hint), { renderHud: () => {}, requestViewRefresh: () => {}, wrapX: (x) => x, wrapY: (y) => y });
  plates.render({ size: 32, project: () => ({ sx: 0, sy: 0 }) }, true);
  const plate = host.querySelector<HTMLElement>(".relic-plate");
  if (!plate) throw new Error("no plate rendered");
  return plate;
};

afterEach(() => { document.body.replaceChildren(); setTrue3DRendererActive(false); });

// Regression (playtest 2026-11-27): the "Relic signal" / "Concordance relic" plate sat over the
// relic tile and swallowed taps meant for the tiles under it.
describe("relic site plates on screen", () => {
  for (const three of [false, true]) {
    it(`let taps through to the map (${three ? "true-3D" : "2D canvas"})`, () => {
      const signal = renderPlate({ x: 10, y: 12, kind: "RELIC" }, three);
      expect(signal.classList.contains("is-passive")).toBe(true);
      document.body.replaceChildren();
      const wake = renderPlate({ x: 10, y: 12, kind: "WAKE", ownerId: "rival" }, three);
      expect(wake.classList.contains("is-passive")).toBe(true);
    });
  }
});

describe("relicPlatePassesTaps", () => {
  it("keeps an edge tab tappable (no tile under it) unless a map point is being picked", () => {
    expect(relicPlatePassesTaps(false, false)).toBe(true);
    expect(relicPlatePassesTaps(true, false)).toBe(false);
    expect(relicPlatePassesTaps(true, true)).toBe(true);
  });
});
