import { CREST_COSMETIC_IDS, type CrestCosmeticId } from "@border-empires/shared";

import { crestSvg } from "./client-house-crest-art.js";
import { crestLabel } from "./client-house-crest.js";
import "./client-crest-picker.css";

// The crest picker: every crest the account may show, each drawn on the
// House's own colour, plus "Letter" (no crest). It lives in the Edit Name,
// Colour & Crest dialog (client-profile-edit-crest.ts). `attr` names the data
// attribute the click handler reads; the picked id is its value ("" = letter).

export type CrestPickerInput = {
  color: string;
  initial: string;
  selected: CrestCosmeticId | undefined;
  /** Crests this account may show (today every crest is free). */
  available: readonly CrestCosmeticId[];
  disabled: boolean;
  attr: "data-profile-edit-crest";
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const crestPickerHtml = (input: CrestPickerInput): string => {
  const usable = new Set(input.available);
  const option = (id: string, face: string, label: string): string => {
    const active = (input.selected ?? "") === id;
    return `<button type="button" class="crest-pick${active ? " is-active" : ""}" ${input.attr}="${id}" aria-pressed="${active}" aria-label="${esc(label)}" title="${esc(label)}" ${input.disabled ? "disabled" : ""}>
      <span class="crest-pick-emblem" style="background:${esc(input.color)}">${face}</span><span class="crest-pick-name">${esc(label)}</span></button>`;
  };
  const crests = CREST_COSMETIC_IDS.filter((id) => usable.has(id)).map((id) => option(id, crestSvg(id), crestLabel(id)));
  return `<div class="crest-picker" role="group" aria-label="House crest">${option("", esc(input.initial), "Letter")}${crests.join("")}</div>`;
};

/** The crest a picker button asks for: undefined when it is not a picker button, null for the letter. */
export const pickedCrest = (button: HTMLElement | null, attr: CrestPickerInput["attr"]): CrestCosmeticId | null | undefined => {
  const value = button?.getAttribute(attr);
  if (value === undefined || value === null) return undefined;
  if (value === "") return null;
  return (CREST_COSMETIC_IDS as readonly string[]).includes(value) ? (value as CrestCosmeticId) : undefined;
};
