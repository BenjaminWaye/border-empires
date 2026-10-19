/** Preserve an in-progress amount/House selection when live economy updates repaint the panel. */
export function rememberAfcFormInputs(root: HTMLElement): () => void {
  const values = Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-afc-recruit] input, [data-afc-court] select")).map(input => ({
    selector: `${input.closest("[data-afc-recruit]") ? "[data-afc-recruit]" : "[data-afc-court]"} [name="${CSS.escape(input.name)}"]`,
    value: input.value, focused: input === document.activeElement
  }));
  return () => { for (const item of values) {
    const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(item.selector);
    if (input) { input.value = item.value; if (item.focused) input.focus({ preventScroll: true }); }
  } };
}
