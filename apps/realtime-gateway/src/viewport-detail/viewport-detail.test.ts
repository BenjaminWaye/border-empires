import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createViewportDetailLoader } from "./viewport-detail.js";
import type { FetchTileDetailResult } from "../sim-client/sim-client.js";

const result = (): FetchTileDetailResult => ({ playerId: "p1", x: 32, y: 32, tiles: [
  { x: 32, y: 32, terrain: "LAND", townJson: '{"name":"Complete detail"}', yieldRate: { GOLD: 1 } }
] });
const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };
const setup = (ended = true) => {
  const socket = new WebSocket(null, undefined, {});
  Object.defineProperty(socket, "readyState", { value: WebSocket.OPEN, configurable: true });
  let season = { seasonId: "season-1", status: ended ? "ended" : "active" };
  const fetch = vi.fn(async () => result());
  const send = vi.fn();
  const record = vi.fn();
  const loader = createViewportDetailLoader({ seasonForPlayer: () => season, fetch, send, record });
  return { loader, socket, fetch, send, record, session: { playerId: "p1", fogDisabled: false },
    setSeason: (value: typeof season) => { season = value; } };
};

describe("revealed-map viewport details", () => {
  it("loads a bounded camera area for ended seasons and skips repeat frozen views", async () => {
    const { loader, socket, session, fetch, send } = setup();
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    await flush();
    expect(fetch).toHaveBeenCalledWith("p1", 32, 32, true, 64);
    expect(send).toHaveBeenCalledWith(socket, result().tiles);
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    loader.subscribe(socket, session, { cx: 9, cy: 4 });
    await flush();
    expect(fetch).toHaveBeenLastCalledWith("p1", 608, 288, true, 64);
  });

  it("does not leak unseen active-season tiles and allows authorized fog reveal", async () => {
    const { loader, socket, session, fetch } = setup(false);
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    expect(fetch).not.toHaveBeenCalled();
    session.fogDisabled = true;
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid panning into one latest pending viewport and drops stale responses", async () => {
    const { loader, socket, session, fetch, send } = setup();
    let complete!: (value: FetchTileDetailResult) => void;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    loader.subscribe(socket, session, { cx: 1, cy: 0 });
    loader.subscribe(socket, session, { cx: 2, cy: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    complete(result());
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith("p1", 160, 32, true, 64);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("drops a previous season's detail after rollover and retries failures", async () => {
    const { loader, socket, session, fetch, send, setSeason } = setup();
    let complete!: (value: FetchTileDetailResult) => void;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    setSeason({ seasonId: "season-2", status: "ended" });
    complete(result());
    await flush();
    expect(send).not.toHaveBeenCalled();
    fetch.mockRejectedValueOnce(new Error("temporary failure"));
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    await flush();
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("discards detail after the socket changes authenticated player", async () => {
    const { loader, socket, session, fetch, send } = setup();
    let complete!: (value: FetchTileDetailResult) => void;
    fetch.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    session.playerId = "p2";
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    await flush();
    expect(fetch).toHaveBeenLastCalledWith("p2", 32, 32, true, 64);
    expect(send).toHaveBeenCalledTimes(1);
    complete(result());
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refreshes detail after an overview replacement even for an unchanged frozen view", async () => {
    const { loader, socket, session, fetch } = setup();
    loader.subscribe(socket, session, { cx: 0, cy: 0 });
    await flush();
    loader.refresh(socket, session);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects unbounded, fractional and invalid camera requests", () => {
    const { loader, socket, session, fetch } = setup();
    for (const cx of [-1, 10, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) loader.subscribe(socket, session, { cx, cy: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
