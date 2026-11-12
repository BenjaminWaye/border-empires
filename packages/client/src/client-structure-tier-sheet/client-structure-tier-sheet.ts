// The Fortify / Siege tier picker sheet: lists every tier the tapped tile can
// take (client-structure-tier-options.ts), each with its stat, cost and --
// when it can't be built -- the reason, so a locked tier explains itself
// instead of vanishing. Same self-contained overlay pattern and brass card as
// the salvage and effort sheets (client-effort-confirm-sheet-style.css).
import type { StructureTierOption } from "../client-types.js";
import "./client-structure-tier-sheet.css";

export type StructureTierSheetOptions = {
  title: string;
  subtitle?: string;
  options: readonly StructureTierOption[];
  onPick: (option: StructureTierOption) => void;
};

let activeSheet: { teardown: () => void } | undefined;

export const hideStructureTierSheet = (): void => activeSheet?.teardown();

export const isStructureTierSheetOpen = (): boolean => activeSheet !== undefined;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

const optionHtml = (entry: StructureTierOption, index: number): string => `
  <button type="button" class="tier-sheet-option" data-tier-index="${index}"${entry.disabled ? " disabled" : ""}>
    <span class="tier-sheet-option-head"><span class="tier-sheet-option-label">${escapeHtml(entry.label)}</span><span class="tier-sheet-option-stat">${escapeHtml(entry.stat)}</span></span>
    <span class="tier-sheet-option-cost">${escapeHtml(entry.cost)}</span>
    ${entry.disabled && entry.disabledReason ? `<span class="tier-sheet-option-reason">${escapeHtml(entry.disabledReason)}</span>` : ""}
  </button>`;

/** Shows the picker; returns false when there is no document to show it in (the caller then does nothing). */
export const showStructureTierSheet = (sheet: StructureTierSheetOptions): boolean => {
  if (typeof document === "undefined" || !document.body || sheet.options.length === 0) return false;
  hideStructureTierSheet();
  let closed = false;
  const overlay = document.createElement("div");
  overlay.className = "tier-sheet-overlay";
  overlay.setAttribute("role", "presentation");
  const card = document.createElement("div");
  card.className = "effort-confirm-card tier-sheet-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", sheet.title);
  card.innerHTML = `
    <h3 class="effort-confirm-title">${escapeHtml(sheet.title)}</h3>
    ${sheet.subtitle ? `<p class="effort-confirm-subtitle">${escapeHtml(sheet.subtitle)}</p>` : ""}
    <div class="tier-sheet-options">${sheet.options.map(optionHtml).join("")}</div>
    <div class="effort-confirm-actions">
      <button type="button" class="effort-confirm-cancel" data-tier-cancel>Cancel</button>
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
  };
  for (const button of Array.from(card.querySelectorAll<HTMLButtonElement>("[data-tier-index]"))) {
    button.addEventListener("click", () => {
      const entry = sheet.options[Number(button.dataset.tierIndex)];
      if (closed || !entry || entry.disabled) return;
      teardown();
      sheet.onPick(entry);
    });
  }
  card.querySelector<HTMLButtonElement>("[data-tier-cancel]")?.addEventListener("click", teardown);
  // Clicking the dimmed backdrop backs out, like Escape.
  overlay.addEventListener("click", (event) => { if (event.target === overlay) teardown(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  activeSheet = { teardown };
  (card.querySelector<HTMLButtonElement>(".tier-sheet-option:not([disabled])") ?? card.querySelector<HTMLButtonElement>("[data-tier-cancel]"))?.focus();
  return true;
};
