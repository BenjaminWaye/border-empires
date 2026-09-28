import { describe, expect, it } from "vitest";

import { KNOWN_PLAYER_STORAGE_KEY, VISITOR_ID_STORAGE_KEY, createAcquisitionFunnel, type AcquisitionFunnelEnv } from "./client-acquisition-funnel.js";

const memoryStorage = (initial: Record<string, string> = {}): NonNullable<AcquisitionFunnelEnv["storage"]> => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null
  };
};

const setup = (storage: AcquisitionFunnelEnv["storage"] = memoryStorage()) => {
  const sent: Array<{ url: string; body: { visitorId: string; step: string; detail: Record<string, string> } }> = [];
  let ids = 0;
  const funnel = createAcquisitionFunnel("https://gw.example/api/funnel", {
    storage,
    sendBeacon: (url, body) => sent.push({ url, body: JSON.parse(body) }),
    randomId: () => `visitor-${++ids}`,
    locationHost: "play.example"
  });
  return { funnel, sent, storage };
};

describe("client acquisition funnel", () => {
  it("sends each step once per page with a persistent visitor id", () => {
    const { funnel, sent, storage } = setup();
    funnel.report("visit", { referrerHost: "borderempires.com" });
    funnel.report("visit");
    funnel.report("auth_form_shown");
    expect(sent.map((s) => s.body)).toEqual([
      { visitorId: "visitor-1", step: "visit", detail: { referrerHost: "borderempires.com" } },
      { visitorId: "visitor-1", step: "auth_form_shown", detail: {} }
    ]);
    expect(sent[0]?.url).toBe("https://gw.example/api/funnel");
    expect(storage?.getItem(VISITOR_ID_STORAGE_KEY)).toBe("visitor-1");
  });

  it("skips existing players (persisted Firebase session or known flag) except for sign_up", () => {
    for (const storage of [memoryStorage({ "firebase:authUser:key:[DEFAULT]": "{}" }), memoryStorage({ [KNOWN_PLAYER_STORAGE_KEY]: "1" })]) {
      const { funnel, sent } = setup(storage);
      funnel.report("visit");
      funnel.report("auth_method_clicked", { method: "google.com" });
      funnel.report("sign_up", { method: "google.com" });
      expect(sent.map((s) => s.body.step)).toEqual(["sign_up"]);
    }
  });

  it("still works, per page, when storage is unavailable", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, length: 0, key: () => null };
    const { funnel, sent } = setup(throwing);
    funnel.report("visit");
    funnel.report("auth_form_shown");
    expect(sent.map((s) => s.body.visitorId)).toEqual(["visitor-1", "visitor-1"]);
  });

  it("never throws when sending fails", () => {
    const funnel = createAcquisitionFunnel("/api/funnel", {
      storage: memoryStorage(),
      sendBeacon: () => { throw new Error("offline"); },
      randomId: () => "visitor-x",
      locationHost: "play.example"
    });
    expect(() => funnel.report("visit")).not.toThrow();
  });
});
