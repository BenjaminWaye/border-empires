import { describe, expect, it } from "vitest";

import type { AcquisitionStepRow } from "../player-funnel-store/player-funnel-store.js";
import { ACQUISITION_SOURCE_ROW_LIMIT, attributeVisit, buildAcquisitionSources } from "./acquisition-sources.js";

const AT = 1_000_000;
const step = (visitorId: string, s: AcquisitionStepRow["step"], detail: Record<string, string> = {}, at = AT): AcquisitionStepRow => ({ visitorId, step: s, at, detail });

describe("attributeVisit", () => {
  it("prefers utm tags, then folds reddit referrer hosts, then falls back to direct", () => {
    expect(attributeVisit({ utmSource: "Reddit", utmCampaign: "r-indiegaming-devlog-1", referrerHost: "out.reddit.com" })).toEqual({ source: "reddit", campaign: "r-indiegaming-devlog-1" });
    expect(attributeVisit({ referrerHost: "old.reddit.com" })).toEqual({ source: "reddit.com", campaign: undefined });
    expect(attributeVisit({ referrerHost: "www.google.com" })).toEqual({ source: "google.com", campaign: undefined });
    expect(attributeVisit({})).toEqual({ source: "direct", campaign: undefined });
  });
});

describe("buildAcquisitionSources", () => {
  it("joins later funnel steps back to the visitor's source and ranks by sign-ups", () => {
    const rows = buildAcquisitionSources([
      step("a", "visit", { utmSource: "reddit", utmCampaign: "post-1" }),
      step("a", "auth_form_shown"),
      step("a", "sign_up", { method: "google" }),
      step("b", "visit", { utmSource: "reddit", utmCampaign: "post-1" }),
      step("c", "visit", { utmSource: "reddit", utmCampaign: "post-2" }),
      step("d", "visit", { referrerHost: "google.com" }),
      step("d", "visit", { referrerHost: "google.com" }, AT - 10),
      step("old", "visit", { utmSource: "discord" }, 0),
      step("orphan", "sign_up")
    ], 1);
    expect(rows[0]).toEqual({ source: "reddit", campaign: "post-1", visitors: 2, formShown: 1, methodClicked: 0, signUps: 1 });
    expect(rows.find((r) => r.source === "direct")?.signUps).toBe(1);
    expect(rows.find((r) => r.campaign === "post-2")?.visitors).toBe(1);
    expect(rows.find((r) => r.source === "google.com")?.visitors).toBe(2);
    expect(rows.some((r) => r.source === "discord")).toBe(false);
  });

  it("caps the table and folds the tail into an 'other' row without losing totals", () => {
    const input = Array.from({ length: ACQUISITION_SOURCE_ROW_LIMIT + 10 }, (_, i) => step(`v${i}`, "visit", { utmSource: `src-${i}` }));
    const rows = buildAcquisitionSources(input, 0);
    expect(rows).toHaveLength(ACQUISITION_SOURCE_ROW_LIMIT);
    expect(rows.at(-1)?.source).toBe("other");
    expect(rows.reduce((sum, r) => sum + r.visitors, 0)).toBe(ACQUISITION_SOURCE_ROW_LIMIT + 10);
  });
});
