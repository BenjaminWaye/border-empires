import { describe, expect, it } from "vitest";

import type { AnalyticsConsent } from "../client-analytics-consent/client-analytics-consent.js";
import { KNOWN_PLAYER_STORAGE_KEY, VISITOR_ID_STORAGE_KEY, createAcquisitionFunnel, type AcquisitionFunnelEnv, type FunnelConsent } from "./client-acquisition-funnel.js";

/** A consent that can be answered during the test. */
const consentOf = (initial?: AnalyticsConsent): FunnelConsent & { answer: (choice: AnalyticsConsent) => void } => {
  let choice = initial;
  const listeners: Array<(choice: AnalyticsConsent) => void> = [];
  return {
    choice: () => choice,
    onChange: (listener) => { listeners.push(listener); },
    answer: (next) => { choice = next; for (const listener of listeners) listener(next); }
  };
};

const memoryStorage = (initial: Record<string, string> = {}): NonNullable<AcquisitionFunnelEnv["storage"]> => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null
  };
};

const setup = (storage: AcquisitionFunnelEnv["storage"] = memoryStorage(), consent = consentOf("granted")) => {
  const sent: Array<{ url: string; body: { visitorId: string; step: string; detail: Record<string, string> } }> = [];
  let ids = 0;
  const funnel = createAcquisitionFunnel("https://gw.example/api/funnel", {
    storage,
    sendBeacon: (url, body) => sent.push({ url, body: JSON.parse(body) }),
    randomId: () => `visitor-${++ids}`,
    locationHost: "play.example"
  }, consent);
  return { funnel, sent, storage, consent };
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
    }, consentOf("granted"));
    expect(() => funnel.report("visit")).not.toThrow();
  });
});

describe("client acquisition funnel consent", () => {
  it("stores and sends nothing until the visitor says yes, then sends what waited", () => {
    const storage = memoryStorage();
    const { funnel, sent, consent } = setup(storage, consentOf());
    funnel.report("visit", { referrerHost: "borderempires.com" });
    funnel.report("auth_form_shown");
    funnel.markKnownPlayer();
    expect(sent).toEqual([]);
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(KNOWN_PLAYER_STORAGE_KEY)).toBeNull();
    consent.answer("granted");
    expect(sent.map((s) => s.body.step)).toEqual(["visit", "auth_form_shown"]);
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBe("visitor-1");
  });

  it("drops what waited on no, and stores and sends nothing after it", () => {
    const storage = memoryStorage();
    const { funnel, sent, consent } = setup(storage, consentOf());
    funnel.report("visit");
    consent.answer("denied");
    funnel.report("auth_method_clicked", { method: "google.com" });
    funnel.report("sign_up", { method: "google.com" });
    funnel.markKnownPlayer();
    expect(sent).toEqual([]);
    expect(storage.length).toBe(0);
  });

  it("keeps each waiting step once", () => {
    const { funnel, sent, consent } = setup(memoryStorage(), consentOf());
    for (let i = 0; i < 10; i += 1) funnel.report("visit");
    consent.answer("granted");
    expect(sent).toHaveLength(1);
  });
});
