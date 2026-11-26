// The "where does the new muster flag go" switch of the effort confirm sheet
// (docs/launch-attack-flag-placement-plan.md §3). Shown only when the attack
// would raise a brand new flag: one segment per spot, each with a risk dot
// and its extra march time; the details (coordinates, distance from the
// enemy) sit in the segment's tooltip and accessible label.

export type FlagSpotTone = "safe" | "close" | "border";

export type EffortSheetFlagSpots = {
  choices: ReadonlyArray<{ label: string; detail: string; tone: FlagSpotTone; hint: string }>;
  /** Index of the segment selected when the sheet opens. */
  selected: number;
  onSelect: (index: number) => void;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

export const renderFlagSpotSection = (spots: EffortSheetFlagSpots): string => `
    <div class="effort-section">
      <div class="effort-section-head">
        <span class="effort-section-label">Flag</span>
        <span class="effort-flag-warn" title="An enemy who takes the flag's tile takes its manpower">Can be captured</span>
      </div>
      <div class="effort-seg" role="radiogroup" aria-label="Where to raise the muster flag">
        ${spots.choices
          .map(
            (choice, index) =>
              `<button type="button" class="effort-seg-item effort-flag-spot" role="radio" data-flag-spot="${index}" data-tone="${choice.tone}" title="${escapeHtml(choice.hint)}" aria-label="${escapeHtml(`${choice.label}: ${choice.hint}`)}"><span class="effort-seg-name"><i class="effort-flag-dot" aria-hidden="true"></i>${escapeHtml(choice.label)}</span><small>${escapeHtml(choice.detail)}</small></button>`
          )
          .join("")}
      </div>
    </div>`;

/** Hooks up the segments rendered by renderFlagSpotSection inside `root`. */
export const wireFlagSpotSection = (root: HTMLElement, spots: EffortSheetFlagSpots, onChange: () => void): void => {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-flag-spot]"));
  let selected = Math.min(Math.max(0, spots.selected), Math.max(0, spots.choices.length - 1));
  const paint = (): void => {
    for (const btn of buttons) {
      const isSelected = Number(btn.dataset.flagSpot) === selected;
      btn.setAttribute("aria-checked", String(isSelected));
      btn.classList.toggle("is-active", isSelected);
    }
  };
  for (const btn of buttons) {
    btn.onclick = () => {
      selected = Number(btn.dataset.flagSpot);
      paint();
      spots.onSelect(selected);
      onChange();
    };
  }
  paint();
};
