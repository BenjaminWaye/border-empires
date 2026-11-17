// The HUD re-renders on every live update. Rewriting the structure / crystal
// ability info overlay's innerHTML each time destroyed its scroll container,
// snapping the modal back to the top mid-scroll (most visible on phones, where
// the modal is taller than the screen). While the same info key stays open,
// keep the mounted `.structure-info-scroll` element (and every unchanged
// section inside it, e.g. the hero image) alive, swap only the sections that
// changed, and restore the scroll offset.
const SCROLL_SELECTOR = ".structure-info-scroll";

const lastHtmlByHost = new WeakMap<HTMLElement, string>();

/** True when two overlay trees are identical outside their scroll bodies. */
const sameShell = (current: HTMLElement, next: DocumentFragment): boolean => {
  const a = current.cloneNode(true) as HTMLElement;
  const b = next.cloneNode(true) as DocumentFragment;
  a.querySelector(SCROLL_SELECTOR)?.replaceChildren();
  b.querySelector(SCROLL_SELECTOR)?.replaceChildren();
  const bHost = current.cloneNode(false) as HTMLElement;
  bHost.append(b);
  return a.isEqualNode(bHost);
};

const patchScrollBody = (current: HTMLElement, next: HTMLElement): void => {
  const scrollTop = current.scrollTop;
  const mounted = Array.from(current.children);
  const incoming = Array.from(next.children);
  // Element children only: whitespace text between sections is static.
  if (mounted.length !== incoming.length) {
    current.replaceChildren(...Array.from(next.childNodes));
  } else {
    incoming.forEach((replacement, index) => {
      const existing = mounted[index];
      if (existing && !existing.isEqualNode(replacement)) existing.replaceWith(replacement);
    });
  }
  current.scrollTop = scrollTop;
};

export const updateStructureInfoOverlay = (host: HTMLElement, key: string, html: string): void => {
  if (host.dataset.infoOverlayKey === key && lastHtmlByHost.get(host) === html) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  const current = host.querySelector<HTMLElement>(SCROLL_SELECTOR);
  const next = template.content.querySelector<HTMLElement>(SCROLL_SELECTOR);
  const reuse = Boolean(key) && host.dataset.infoOverlayKey === key && current && next && sameShell(host, template.content);
  lastHtmlByHost.set(host, html);
  host.dataset.infoOverlayKey = key;
  if (reuse && current && next) patchScrollBody(current, next);
  else host.replaceChildren(template.content);
};

/** Renders whichever info overlay (structure or crystal ability) is open into its host. */
export const syncInfoOverlay = (
  host: HTMLElement,
  open: { structureInfoKey: string; crystalAbilityInfoKey: string },
  render: { structure: () => string; crystal: (key: string) => string }
): void => {
  const { structureInfoKey, crystalAbilityInfoKey } = open;
  if (structureInfoKey) updateStructureInfoOverlay(host, `structure:${structureInfoKey}`, render.structure());
  else if (crystalAbilityInfoKey) updateStructureInfoOverlay(host, `crystal:${crystalAbilityInfoKey}`, render.crystal(crystalAbilityInfoKey));
  else updateStructureInfoOverlay(host, "", "");
  host.style.display = structureInfoKey || crystalAbilityInfoKey ? "grid" : "none";
};
