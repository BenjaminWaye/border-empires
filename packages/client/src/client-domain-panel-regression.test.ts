import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("domain panel detail layout regression guard", () => {
  it("keeps desktop domain detail open in a split overview and detail layout", () => {
    const styleSource = sourceFor("./style.css");

    expect(styleSource).toContain("#side-panel.domain-panel-active #panel-domains-content");
    expect(styleSource).toContain("grid-template-columns: minmax(0, 1fr) 320px;");
    expect(styleSource).toContain("#side-panel.domain-panel-active #panel-domains.domain-detail-open #domains-overview-content");
    expect(styleSource).toContain("#side-panel.domain-panel-active #panel-domains.domain-detail-open #domains-detail-content");
  });
});
