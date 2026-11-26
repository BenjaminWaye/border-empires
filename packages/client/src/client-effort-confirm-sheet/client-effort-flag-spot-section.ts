// The "where does the new muster flag go" block of the effort confirm sheet
// (docs/launch-attack-flag-placement-plan.md §3). Shown only when the attack
// would raise a brand new flag: a warning that flags can be captured, then one
// chip per spot the player can choose from, the first selected by default.

export type EffortSheetFlagSpots = {
  notice: string;
  choices: ReadonlyArray<{ label: string; detail: string }>;
  /** Index of the chip selected when the sheet opens. */
  selected: number;
  onSelect: (index: number) => void;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

export const renderFlagSpotSection = (spots: EffortSheetFlagSpots): string => `
    <div class="effort-flag-spots" role="radiogroup" aria-label="Where to raise the muster flag">
      <p class="effort-flag-spots-notice">${escapeHtml(spots.notice)}</p>
      ${spots.choices
        .map(
          (choice, index) =>
            `<button type="button" class="effort-flag-spot" role="radio" data-flag-spot="${index}"><span>${escapeHtml(choice.label)}</span><small>${escapeHtml(choice.detail)}</small></button>`
        )
        .join("")}
    </div>`;

/** Hooks up the chips rendered by renderFlagSpotSection inside `root`. */
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
