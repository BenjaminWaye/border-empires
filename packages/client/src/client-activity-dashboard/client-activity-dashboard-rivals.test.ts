import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { rivalDetail, rivalSectionHtml, rivalVerdict } from "./client-activity-dashboard-rivals.js";

const rival = { playerId: "hugo", tilesTaken: 2, tilesLost: 1, attacksRepelled: 3, attacksFailed: 0 };

describe("rivals section", () => {
  it("describes the exchange and who is ahead on ground", () => {
    expect(rivalDetail(rival)).toBe("took 2 tiles · lost 1 tile · repelled 3 of their attacks");
    expect(rivalVerdict(rival)).toBe("ahead");
    expect(rivalVerdict({ ...rival, tilesLost: 2 })).toBe("even");
    expect(rivalVerdict({ ...rival, tilesTaken: 0 })).toBe("behind");
    expect(rivalVerdict({ ...rival, tilesTaken: 0, tilesLost: 0 })).toBeUndefined();
  });

  it("renders named rivals and nothing when there are none or the field is missing", () => {
    const timeline = { rivals: [rival] } as unknown as PersonalActivityTimeline;
    const html = rivalSectionHtml(timeline, (id) => (id === "hugo" ? "Hugo" : undefined));
    expect(html).toContain("<h3>Rivals</h3>");
    expect(html).toContain("<strong>Hugo</strong>");
    expect(html).toContain("You're ahead");
    expect(rivalSectionHtml({ rivals: [] } as unknown as PersonalActivityTimeline, () => undefined)).toBe("");
    expect(rivalSectionHtml({} as unknown as PersonalActivityTimeline, () => undefined)).toBe("");
  });
});
