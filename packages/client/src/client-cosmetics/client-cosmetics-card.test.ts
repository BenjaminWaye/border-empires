// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { FREE_COSMETIC_IDS, type CosmeticId, type PlayerCosmeticSelection } from "@border-empires/shared";

import { bindCosmeticsCard, cosmeticsCardHtml } from "./client-cosmetics-card.js";

const createState = (owned: CosmeticId[] = [], selection?: PlayerCosmeticSelection) => ({
  me: "me",
  authSessionReady: true,
  cosmeticsRequested: false,
  ownedCosmetics: owned,
  playerCosmetics: new Map<string, PlayerCosmeticSelection>(selection ? [["me", selection]] : []),
  serverSupportedMessageTypes: new Set(["REQUEST_COSMETICS", "SET_COSMETIC"])
});

describe("cosmeticsCardHtml", () => {
  it("renders nothing for an account that owns no cosmetic", () => {
    expect(cosmeticsCardHtml(createState())).toBe("");
  });

  it("renders nothing for an account that owns only the free House crests, which the profile dialog picks", () => {
    expect(cosmeticsCardHtml(createState([...FREE_COSMETIC_IDS]))).toBe("");
    expect(cosmeticsCardHtml(createState(["flag-high-noble", ...FREE_COSMETIC_IDS]))).not.toContain("crest");
  });

  it("offers the standard look and each owned cosmetic", () => {
    const html = cosmeticsCardHtml(createState(["flag-high-noble"], { musterFlag: "flag-high-noble" }));
    expect(html).toContain('data-cosmetic-slot="musterFlag" data-cosmetic-id="" aria-pressed="false"');
    expect(html).toContain('data-cosmetic-slot="musterFlag" data-cosmetic-id="flag-high-noble" aria-pressed="true"');
  });
});

describe("bindCosmeticsCard", () => {
  const mount = (state: ReturnType<typeof createState>) => {
    const hud = document.createElement("div");
    hud.innerHTML = cosmeticsCardHtml(state);
    const sendGameMessage = vi.fn((_payload: unknown, _message?: string) => true);
    bindCosmeticsCard({ state, dom: { hud }, sendGameMessage });
    return { hud, sendGameMessage };
  };

  it("asks the server once what the account owns", () => {
    const state = createState();
    const { hud, sendGameMessage } = mount(state);
    bindCosmeticsCard({ state, dom: { hud }, sendGameMessage });
    expect(sendGameMessage.mock.calls).toEqual([[{ type: "REQUEST_COSMETICS" }]]);
  });

  it("does not ask a server that predates cosmetics", () => {
    const state = createState();
    state.serverSupportedMessageTypes.clear();
    expect(mount(state).sendGameMessage).not.toHaveBeenCalled();
  });

  it("sends the chosen cosmetic, and null for the standard look", () => {
    const state = createState(["flag-high-noble"]);
    state.cosmeticsRequested = true;
    const { hud, sendGameMessage } = mount(state);
    hud.querySelector<HTMLButtonElement>('[data-cosmetic-id="flag-high-noble"]')?.click();
    hud.querySelector<HTMLButtonElement>('[data-cosmetic-id=""]')?.click();
    expect(sendGameMessage.mock.calls.map(([payload]) => payload)).toEqual([
      { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-high-noble" },
      { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: null }
    ]);
  });
});
