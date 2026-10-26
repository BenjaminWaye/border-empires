// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { screen, SCREEN_HOST_ID } from "./client-hud-v2-context.js";
import { installMapGuard } from "./client-hud-v2-town-runtime.js";

describe("town screen mouse guard", () => {
  afterEach(() => {
    screen.id = null;
    document.body.innerHTML = "";
  });

  // Regression: clicking in the town screen's build list closed it (the map hides the tile menu on any
  // window mousedown outside the menu, and hiding the menu closes the town screen).
  it("keeps mousedowns inside the town screen from reaching the map's hide-menu listener", () => {
    document.body.innerHTML = `<canvas id="game"></canvas><div id="${SCREEN_HOST_ID}"><button id="pick">Mine</button></div>`;
    installMapGuard();
    let reachedWindow = 0;
    const onWindow = (): void => { reachedWindow += 1; };
    window.addEventListener("mousedown", onWindow);
    screen.id = "town";
    document.getElementById("pick")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(reachedWindow).toBe(0);
    screen.id = "manifest";
    document.getElementById("pick")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(reachedWindow).toBe(1);
    window.removeEventListener("mousedown", onWindow);
  });
});
