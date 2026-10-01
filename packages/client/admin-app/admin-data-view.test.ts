// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { renderDataView } from "./admin-data-view.js";

describe("renderDataView", () => {
  it("renders a wrapped list of objects as a table without interpreting markup", () => {
    const view = renderDataView(JSON.stringify({ ok: true, players: [{ id: "p1", name: "<img src=x onerror=alert(1)>" }, { id: "p2", gold: 5 }] }), "application/json; charset=utf-8");
    const headers = Array.from(view.querySelectorAll("th")).map((th) => th.textContent);
    expect(headers).toEqual(["id", "name", "gold"]);
    expect(view.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(view.querySelector("img")).toBeNull();
    expect(view.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("falls back to formatted JSON, and to plain text for non-JSON responses", () => {
    expect(renderDataView('{"ok":true,"count":3}', "application/json").textContent).toContain('"count": 3');
    expect(renderDataView("gateway_up 1\n", "text/plain").textContent).toBe("gateway_up 1\n");
  });
});
