import { afterEach, describe, expect, it, vi } from "vitest";

// Review finding (PR #3022): a crest image that failed to load stayed broken
// for the session, so its muster banners never showed it. A failed load is
// now retried once with a fresh image.

type Listener = () => void;

const installFakeImage = (failures: number) => {
  const created: FakeImage[] = [];
  let remainingFailures = failures;
  class FakeImage {
    decoding = "";
    complete = false;
    naturalWidth = 0;
    private readonly listeners = new Map<string, Listener[]>();
    constructor() { created.push(this); }
    addEventListener(type: string, listener: Listener): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    set src(_value: string) {
      queueMicrotask(() => {
        this.complete = true;
        const failed = remainingFailures > 0;
        if (failed) remainingFailures -= 1;
        else this.naturalWidth = 96;
        for (const listener of this.listeners.get(failed ? "error" : "load") ?? []) listener();
      });
    }
  }
  vi.stubGlobal("Image", FakeImage);
  return created;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("crest image loading", () => {
  it("retries a failed load once with a fresh image", async () => {
    const created = installFakeImage(1);
    const { loadCrestImage } = await import("./client-crest-image.js");
    const image = await loadCrestImage("crest-anchor", "#ff0000");
    expect(image).toBeDefined();
    expect(created).toHaveLength(2);
  });

  it("gives up after the retry fails, without hanging or retrying every call", async () => {
    const created = installFakeImage(2);
    const { crestImage, loadCrestImage } = await import("./client-crest-image.js");
    expect(await loadCrestImage("crest-key", "#ff0000")).toBeUndefined();
    expect(await loadCrestImage("crest-key", "#ff0000")).toBeUndefined();
    expect(crestImage("crest-key", "#ff0000")).toBeUndefined();
    expect(created).toHaveLength(2);
  });

  it("escapes the colour put into the SVG", async () => {
    const { crestSvgDocument } = await import("./client-crest-image.js");
    const doc = crestSvgDocument("crest-cog", '#fff" onload="x');
    expect(doc).not.toContain('onload="x"');
    expect(doc).toContain("&quot;");
  });
});
