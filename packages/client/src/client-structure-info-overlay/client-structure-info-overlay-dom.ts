// The HUD re-renders on every live update. Rewriting the structure / crystal
// ability info overlay's innerHTML each time destroyed its scroll container,
// snapping the modal back to the top mid-scroll (most visible on phones, where
// the modal is taller than the screen). Keep the mounted `.structure-info-scroll`
// element alive while the same info key stays open and only swap its contents
// when they actually change, restoring the scroll offset.
const SCROLL_SELECTOR = ".structure-info-scroll";

export const updateStructureInfoOverlay = (host: HTMLElement, key: string, html: string): void => {
  const template = document.createElement("template");
  template.innerHTML = html;
  const current = host.querySelector<HTMLElement>(SCROLL_SELECTOR);
  const next = template.content.querySelector<HTMLElement>(SCROLL_SELECTOR);
  if (!key || !current || !next || host.dataset.infoOverlayKey !== key) {
    host.dataset.infoOverlayKey = key;
    host.replaceChildren(template.content);
    return;
  }
  if (current.isEqualNode(next)) return;
  const scrollTop = current.scrollTop;
  current.replaceChildren(...Array.from(next.childNodes));
  current.scrollTop = scrollTop;
};
