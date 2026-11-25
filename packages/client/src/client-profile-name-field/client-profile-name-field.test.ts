// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedProfileSetupFields } from "../client-auth-ui/client-auth-ui.js";
import { hudMarkup } from "../client-dom-markup/client-dom-markup.js";
import { bindProfileNameField, clearFoundingNameDraft, readFoundingNameDraft, writeFoundingNameDraft } from "./client-profile-name-field.js";

// 2026-11 playtest (375x667 phone): "Found your first standard" opened with a
// suggested name; the tap left the caret at the end, so typing "House
// Marlowe" appended to "House Blackcrest" and maxlength=24 cut it to
// "House BlackcrestHouse Ma" without a word.
const mountFoundingBox = () => {
  document.body.innerHTML = hudMarkup;
  const nameEl = document.querySelector<HTMLInputElement>("#auth-profile-name")!;
  const colorEl = document.querySelector<HTMLInputElement>("#auth-profile-color") ?? document.createElement("input");
  bindProfileNameField(nameEl, { onUserInput: writeFoundingNameDraft });
  const seed = (name: string): void =>
    seedProfileSetupFields({ authProfileNameEl: nameEl, authProfileColorEl: colorEl, syncAuthPanelState: () => {} }, name);
  return { nameEl, seed };
};

const typeName = (input: HTMLInputElement, text: string): void => {
  // What a browser does on typing: replace the current selection.
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = (input.value.slice(0, start) + text + input.value.slice(end)).slice(0, input.maxLength > 0 ? input.maxLength : undefined);
  input.dispatchEvent(new Event("input"));
};

afterEach(() => {
  clearFoundingNameDraft();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("founding name box", () => {
  it("the real founding box is wired to select-all and the session draft", () => {
    const controls = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../client-ui-controls/client-ui-controls.ts"), "utf8");
    expect(controls).toContain("bindProfileNameField(authProfileNameEl, { onUserInput: writeFoundingNameDraft });");
  });

  it("tapping the suggested name selects it, so typing replaces it", () => {
    const { nameEl, seed } = mountFoundingBox();
    seed("House Blackcrest");
    nameEl.focus();
    nameEl.dispatchEvent(new FocusEvent("focus"));
    // The mouseup a tap sends after focus would move the caret; it is re-selected.
    nameEl.setSelectionRange(nameEl.value.length, nameEl.value.length);
    nameEl.dispatchEvent(new MouseEvent("mouseup", { cancelable: true }));
    typeName(nameEl, "House Marlowe");
    expect(nameEl.value).toBe("House Marlowe");
  });

  it("keeps the suggestion when the box is never touched", () => {
    const { nameEl, seed } = mountFoundingBox();
    seed("House Blackcrest");
    expect(nameEl.value).toBe("House Blackcrest");
    expect(readFoundingNameDraft()).toBe("");
  });

  it("shows an n/24 count that follows the value", () => {
    const { nameEl, seed } = mountFoundingBox();
    seed("House Blackcrest");
    const count = document.querySelector("#auth-profile-name-count")!;
    expect(count.textContent).toBe("16/24");
    nameEl.dispatchEvent(new FocusEvent("focus"));
    typeName(nameEl, "Ada");
    expect(count.textContent).toBe("3/24");
  });

  it("a typed name survives a reload: the draft beats the server's suggestion", () => {
    const first = mountFoundingBox();
    first.seed("House Blackcrest");
    first.nameEl.dispatchEvent(new FocusEvent("focus"));
    typeName(first.nameEl, "House Marlowe");
    // Reload: fresh DOM, server suggests a name again on INIT.
    const second = mountFoundingBox();
    second.seed("House Ironvale");
    expect(second.nameEl.value).toBe("House Marlowe");
    clearFoundingNameDraft();
    second.seed("House Ironvale");
    expect(second.nameEl.value).toBe("House Ironvale");
  });

  it("works when sessionStorage throws", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { nameEl, seed } = mountFoundingBox();
    seed("House Blackcrest");
    nameEl.dispatchEvent(new FocusEvent("focus"));
    expect(() => typeName(nameEl, "House Marlowe")).not.toThrow();
    expect(nameEl.value).toBe("House Marlowe");
    expect(readFoundingNameDraft()).toBe("");
  });
});
