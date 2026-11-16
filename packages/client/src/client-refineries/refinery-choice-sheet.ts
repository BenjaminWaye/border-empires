// The refinery pickers' sheet: a list of choices (fields, towns, ring tiles)
// with their slot gain and, for a choice that cannot be taken, the reason.
// Same card and row styling as the Fortify / Siege tier sheet, but docked at
// the bottom without a dimmed backdrop, so the map's field and reach
// highlights stay visible while the player chooses. Pointing at a row tells
// the caller (to focus that field on the map).
import "../client-structure-tier-sheet/client-structure-tier-sheet.css";
import "./refinery-choice-sheet.css";

export type RefineryChoice = {
  label: string;
  stat: string;
  detail: string;
  disabled: boolean;
  reason?: string;
};

export type RefineryChoiceSheetOptions = {
  title: string;
  subtitle?: string;
  choices: readonly RefineryChoice[];
  onPick: (index: number) => void;
  /** The row pointed at or focused (undefined when none). */
  onFocus?: (index: number | undefined) => void;
  /** Called once when the sheet closes, picked or not. */
  onClose?: () => void;
};

let activeSheet: { teardown: () => void } | undefined;

export const hideRefineryChoiceSheet = (): void => activeSheet?.teardown();
export const isRefineryChoiceSheetOpen = (): boolean => activeSheet !== undefined;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

const choiceHtml = (choice: RefineryChoice, index: number): string => `
  <button type="button" class="tier-sheet-option refinery-sheet-option" data-refinery-choice="${index}"${choice.disabled ? " disabled" : ""}>
    <span class="tier-sheet-option-head"><span class="tier-sheet-option-label">${escapeHtml(choice.label)}</span><span class="tier-sheet-option-stat">${escapeHtml(choice.stat)}</span></span>
    <span class="tier-sheet-option-cost">${escapeHtml(choice.detail)}</span>
    ${choice.disabled && choice.reason ? `<span class="tier-sheet-option-reason">${escapeHtml(choice.reason)}</span>` : ""}
  </button>`;

/** Shows the sheet; false when there is no document or nothing to choose. */
export const showRefineryChoiceSheet = (sheet: RefineryChoiceSheetOptions): boolean => {
  if (typeof document === "undefined" || !document.body || sheet.choices.length === 0) return false;
  hideRefineryChoiceSheet();
  let closed = false;
  const overlay = document.createElement("div");
  overlay.className = "refinery-sheet-dock";
  const card = document.createElement("div");
  card.className = "effort-confirm-card tier-sheet-card refinery-sheet-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", sheet.title);
  card.innerHTML = `
    <h3 class="effort-confirm-title">${escapeHtml(sheet.title)}</h3>
    ${sheet.subtitle ? `<p class="effort-confirm-subtitle">${escapeHtml(sheet.subtitle)}</p>` : ""}
    <div class="tier-sheet-options">${sheet.choices.map(choiceHtml).join("")}</div>
    <div class="effort-confirm-actions">
      <button type="button" class="effort-confirm-cancel" data-refinery-cancel>Cancel</button>
    </div>
  `;
  overlay.appendChild(card);
  const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") teardown(); };
  const teardown = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    if (activeSheet?.teardown === teardown) activeSheet = undefined;
    sheet.onClose?.();
  };
  for (const button of Array.from(card.querySelectorAll<HTMLButtonElement>("[data-refinery-choice]"))) {
    const index = Number(button.dataset.refineryChoice);
    button.addEventListener("click", () => {
      if (closed || !sheet.choices[index] || sheet.choices[index]!.disabled) return;
      teardown();
      sheet.onPick(index);
    });
    button.addEventListener("pointerenter", () => sheet.onFocus?.(index));
    button.addEventListener("focus", () => sheet.onFocus?.(index));
  }
  card.addEventListener("pointerleave", () => sheet.onFocus?.(undefined));
  card.querySelector<HTMLButtonElement>("[data-refinery-cancel]")?.addEventListener("click", teardown);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  activeSheet = { teardown };
  (card.querySelector<HTMLButtonElement>(".refinery-sheet-option:not([disabled])") ?? card.querySelector<HTMLButtonElement>("[data-refinery-cancel]"))?.focus();
  return true;
};
