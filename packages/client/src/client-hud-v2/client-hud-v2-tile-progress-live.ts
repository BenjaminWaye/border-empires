// Keep buttons and focus stable while only the countdown, fill or rush price changes.
// Other changes (a different job, controls or tile facts) still rebuild the panel.
export const syncTileProgress = (bar: HTMLElement, previousHtml: string, nextHtml: string): boolean => {
  const previous = bar.ownerDocument.createElement("div");
  const next = bar.ownerDocument.createElement("div");
  previous.innerHTML = previousHtml;
  next.innerHTML = nextHtml;
  const selector = "[data-v2-progress-live]";
  const values = Array.from(next.querySelectorAll<HTMLElement>(selector)).map((element) => ({
    key: element.dataset.v2ProgressLive,
    text: element.textContent,
    width: element.style.width
  }));
  if (values.length === 0) return false;
  for (const root of [previous, next]) {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (element.dataset.v2ProgressLive === "fill") element.removeAttribute("style");
      else element.textContent = "";
    });
  }
  if (previous.innerHTML !== next.innerHTML) return false;
  const current = Array.from(bar.querySelectorAll<HTMLElement>(selector));
  if (current.length !== values.length || current.some((element, i) => element.dataset.v2ProgressLive !== values[i]?.key)) return false;
  current.forEach((element, i) => {
    const value = values[i]!;
    if (value.key === "fill") element.style.width = value.width;
    else if (element.textContent !== value.text) element.textContent = value.text;
  });
  return true;
};
