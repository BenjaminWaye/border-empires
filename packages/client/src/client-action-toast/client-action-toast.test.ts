// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTION_TOAST_MS, firstSentence, showActionToast } from "./client-action-toast.js";

afterEach(() => {
  vi.useRealTimers();
  document.getElementById("action-toast")?.remove();
});

describe("showActionToast", () => {
  it("shows the line, replaces an earlier one, then fades on its own", () => {
    vi.useFakeTimers();
    showActionToast("Hydrogarden started");
    showActionToast("Land claimed");
    const toasts = document.querySelectorAll("#action-toast");
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.textContent).toBe("Land claimed");
    expect(toasts[0]?.getAttribute("role")).toBe("status");
    expect(toasts[0]?.classList.contains("is-visible")).toBe(true);
    vi.advanceTimersByTime(ACTION_TOAST_MS - 1);
    expect(toasts[0]?.classList.contains("is-visible")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toasts[0]?.classList.contains("is-visible")).toBe(false);
  });

  it("ignores empty text", () => {
    showActionToast("  ");
    expect(document.getElementById("action-toast")).toBeNull();
  });
});

describe("firstSentence", () => {
  it("keeps only the first sentence of an announcement", () => {
    expect(firstSentence("Bryn accepted your 12h truce. Bryn wants peace.")).toBe("Bryn accepted your 12h truce.");
    expect(firstSentence("Trade agreed")).toBe("Trade agreed");
  });
});
