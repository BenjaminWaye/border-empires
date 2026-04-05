import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("mobile leaderboard navigation regression guard", () => {
  it("keeps leaderboard and activity feed on separate mobile buttons and sheets", () => {
    const domSource = sourceFor("./client-dom.ts");
    const navSource = sourceFor("./client-panel-nav.ts");
    const styleSource = sourceFor("./style.css");

    expect(domSource).toContain('data-mobile-panel="leaderboard"');
    expect(domSource).toContain('data-mobile-panel="feed"');
    expect(domSource).toContain('id="mobile-panel-leaderboard"');
    expect(domSource).toContain('id="mobile-panel-feed"');
    expect(navSource).toContain('if (panel === "leaderboard") return "leaderboard";');
    expect(navSource).toContain('if (panel === "leaderboard") return \'<span class="tab-icon">🏆</span>\';');
    expect(navSource).toContain('else if (state.mobilePanel === "feed") deps.mobileSheetHeadEl.textContent = "Activity Feed";');
    expect(styleSource).toContain("grid-template-columns: repeat(7, minmax(0, 1fr));");
  });
});
