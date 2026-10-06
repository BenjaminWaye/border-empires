/**
 * Bay selection for the Modules tab. Purely client-side: the selected bay is
 * kept on the menu element's dataset so it survives the tile-menu re-renders
 * that tile deltas trigger (countdowns, a module landing), and only the
 * matching detail card is shown -- no full re-render per tap.
 */
export const bindAfcModuleBays = (menuEl: HTMLElement, tileKey: string): void => {
  const root = menuEl.querySelector<HTMLElement>("[data-afc-bays]");
  if (!root) return;
  if (menuEl.dataset.afcBayTile !== tileKey) {
    menuEl.dataset.afcBayTile = tileKey;
    delete menuEl.dataset.afcBay;
  }
  const select = (bayIndex: string | undefined): void => {
    if (bayIndex === undefined) delete menuEl.dataset.afcBay;
    else menuEl.dataset.afcBay = bayIndex;
    root.querySelectorAll<HTMLElement>("[data-afc-bay-detail]").forEach((detail) => {
      detail.hidden = detail.dataset.afcBayDetail !== bayIndex;
    });
    root.querySelectorAll<HTMLElement>("[data-afc-bay]").forEach((bay) => {
      bay.classList.toggle("is-selected", bay.dataset.afcBay === bayIndex);
    });
    const hint = root.querySelector<HTMLElement>("[data-afc-bay-hint]");
    if (hint) hint.hidden = bayIndex !== undefined;
  };
  root.querySelectorAll<HTMLButtonElement>("button[data-afc-bay]").forEach((bay) => {
    bay.onclick = () => select(menuEl.dataset.afcBay === bay.dataset.afcBay ? undefined : bay.dataset.afcBay);
  });
  select(menuEl.dataset.afcBay);
};
