// Extracted from the per-frame draw() in client-runtime-loop.ts (500-line cap):
// writes the current FPS / zoom into every on-screen readout element,
// touching the DOM only where the text actually changed.
const paintReadouts = (selector: string, label: string): void => {
  const readouts = document.querySelectorAll<HTMLElement>(selector);
  readouts.forEach((el) => {
    if (el.textContent !== label) el.textContent = label;
  });
};

export const paintFpsAndZoomReadouts = (fps: number | undefined, zoom: number): void => {
  paintReadouts("[data-fps-readout]", fps === undefined ? "—" : Math.round(fps).toString());
  paintReadouts("[data-zoom-readout]", Math.round(zoom).toString());
};
