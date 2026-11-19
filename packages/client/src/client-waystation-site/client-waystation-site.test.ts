// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientMessageSchema } from "@border-empires/shared";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import type { Tile } from "../client-types.js";
import { createWaystationReadyToasts } from "./client-waystation-ready-toasts.js";
import { activateWaystationSite, installWaystationActivation, waystationActions } from "./client-waystation-site.js";
import { ensureClientCommandEnvelope } from "../client-command-envelope/client-command-envelope.js";
import { dispatchTileAetherAction } from "../client-afc-upgrades/client-afc-tower-action.js";

const rig = (): Tile => ({ x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", waystation: { activated: false } });
afterEach(() => { setTrue3DRendererActive(false); document.body.replaceChildren(); });

describe("waystation prompt and Activate", () => {
  it.each([false, true])("stays over the site until the reward is taken (true-3D=%s)", three => {
    setTrue3DRendererActive(three);
    const tile = rig();
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 600;
    host.append(canvas); document.body.append(host);
    canvas.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    const state = { me: "me", authSessionReady: true, profileSetupRequired: false, tiles: new Map([["10,10", tile]]) };
    const send = vi.fn((_payload: unknown) => true);
    installWaystationActivation(state, send);
    const toasts = createWaystationReadyToasts(canvas, state);
    const visible = [{ wx: 10, wy: 10, wk: "10,10", px: 300, py: 300, vis: "visible", t: tile }];
    const project = vi.fn(() => ({ sx: 420, sy: 360 }));
    const paint = () => toasts.render(visible, { size: 48, project });
    paint();
    const card = host.querySelector<HTMLElement>(".waystation-toast")!;
    expect(card.textContent).toContain("Reward available");
    expect(card.style.left).toBe(three ? "420px" : "324px");
    expect(project).toHaveBeenCalledTimes(three ? 1 : 0);
    const button = card.querySelector("button")!;
    button.click();
    expect(send).toHaveBeenCalledWith({ type: "ACTIVATE_WAYSTATION", x: 10, y: 10 });
    expect(ClientMessageSchema.safeParse(send.mock.calls[0]?.[0]).success).toBe(true);
    paint();
    expect(host.querySelector(".waystation-toast")).toBe(card); // no timer or optimistic dismissal
    visible[0]!.vis = "fogged";
    paint();
    expect(host.querySelector(".waystation-toast")).toBeNull();
    visible[0]!.vis = "visible";
    paint();
    expect(host.querySelector(".waystation-toast")).not.toBeNull();
    tile.ownerId = "rival";
    paint();
    expect(host.querySelector(".waystation-toast")).toBeNull(); // only above rigs the player has taken
    delete tile.ownerId;
    paint();
    expect(host.querySelector(".waystation-toast")).toBeNull();
    tile.ownerId = "me";
    paint();
    expect(host.querySelector(".waystation-toast")).not.toBeNull();
    tile.waystation = { activated: true };
    paint();
    expect(host.querySelector(".waystation-toast")).toBeNull();
    expect(activateWaystationSite(tile)).toBe(false);
    toasts.dispose();
  });

  it("keeps a durable command identity when collection is retried", () => {
    const payload: { type: string; x: number; y: number; commandId?: string; clientSeq?: number } = { type: "ACTIVATE_WAYSTATION", x: 10, y: 10 };
    const state = { nextCommandClientSeq: 1 };
    ensureClientCommandEnvelope(state, payload);
    const identity = payload.commandId;
    expect(identity).toEqual(expect.any(String));
    expect(payload.clientSeq).toBe(1);
    ensureClientCommandEnvelope(state, payload);
    expect(payload.commandId).toBe(identity);
    expect(state.nextCommandClientSeq).toBe(2);
  });

  it("offers the same guarded action from the tile menu", () => {
    const tile = rig();
    expect(waystationActions({ me: "me" }, tile)).toEqual([expect.objectContaining({ id: "activate_waystation", disabled: false, recommended: true })]);
    const send = vi.fn((_payload: unknown) => true);
    dispatchTileAetherAction("activate_waystation", tile, { aetherLanceFxQueue: [] }, send);
    expect(send).toHaveBeenCalledWith({ type: "ACTIVATE_WAYSTATION", x: 10, y: 10 });
    expect(waystationActions({ me: "other" }, tile)[0]?.disabled).toBe(true);
    tile.fogged = true;
    expect(waystationActions({ me: "me" }, tile)).toEqual([]);
  });

  it("never sends when the current tile was taken, fogged, or lost since rendering", () => {
    const tile = rig();
    const state = { me: "me", tiles: new Map([["10,10", tile]]) };
    const send = vi.fn(() => false);
    installWaystationActivation(state, send);
    expect(activateWaystationSite(tile)).toBe(false); // disconnected, keep prompt
    expect(tile.waystation?.activated).toBe(false);
    send.mockClear();
    tile.ownerId = "rival";
    expect(activateWaystationSite(tile)).toBe(false);
    tile.ownerId = "me"; tile.fogged = true;
    expect(activateWaystationSite(tile)).toBe(false);
    tile.fogged = false; tile.waystation = { activated: true };
    expect(activateWaystationSite(tile)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
