// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { enqueueFullscreenCard, resetFullscreenCardQueueForTests } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";
import { isMapCoveredByRewardCard } from "./holo-crate-map-covered.js";

afterEach(() => { resetFullscreenCardQueueForTests(); document.body.replaceChildren(); });

describe("isMapCoveredByRewardCard", () => {
  it("is true while a full-screen card is up and false once it closes", () => {
    expect(isMapCoveredByRewardCard()).toBe(false);
    let close = (): void => undefined;
    enqueueFullscreenCard({ key: "waystation-activation", show: (done) => { close = done; const el = document.createElement("div"); document.body.append(el); return el; } });
    expect(isMapCoveredByRewardCard()).toBe(true);
    document.body.replaceChildren();
    close();
    expect(isMapCoveredByRewardCard()).toBe(false);
  });
});
