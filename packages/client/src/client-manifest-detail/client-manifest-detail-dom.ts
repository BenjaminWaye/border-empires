// Keep the scrolling body mounted across live HUD updates so mobile touch
// scrolling continues even when the header or unlock requirements change.
export const updateManifestDetail = (host: HTMLElement, html: string): void => {
  const template = document.createElement("template");
  template.innerHTML = html;
  const current = host.querySelector<HTMLElement>("[data-manifest-detail]");
  const next = template.content.querySelector<HTMLElement>("[data-manifest-detail]");
  if (!current || !next || current.dataset.manifestDetail !== next.dataset.manifestDetail || current.className !== next.className) {
    if (host.innerHTML !== html) host.innerHTML = html;
    return;
  }
  for (const selector of [".manifest-detail__head", ".manifest-detail__body", ".manifest-detail__foot"]) {
    const mounted = current.querySelector<HTMLElement>(selector);
    const replacement = next.querySelector<HTMLElement>(selector);
    if (!mounted || !replacement || mounted.isEqualNode(replacement)) continue;
    const scrollTop = mounted.scrollTop;
    mounted.replaceChildren(...Array.from(replacement.childNodes));
    mounted.scrollTop = scrollTop;
  }
};

export const renderMobileManifestOverlay = (
  host: HTMLElement,
  useOverlay: boolean,
  state: { techDetailOpen: boolean; domainDetailOpen: boolean },
  renderTech: () => string,
  renderDomain: () => string
): void => {
  const html = useOverlay
    ? state.techDetailOpen ? renderTech() : state.domainDetailOpen ? renderDomain() : ""
    : "";
  updateManifestDetail(host, html);
  host.style.display = html ? "grid" : "none";
};
