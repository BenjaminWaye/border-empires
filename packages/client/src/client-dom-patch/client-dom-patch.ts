// Re-renders a panel from fresh HTML while keeping the elements that are still
// there. Panels that set innerHTML on every HUD tick (the Manpower panel redraws
// each second) swap out the button under the player's finger between press and
// release, so the tap never lands (2026-11-27: muster flag rows ignored taps).
// This walks the new markup against the live DOM and only replaces a node whose
// kind or tag changed; text and attributes are updated in place, so a row
// that only shows a new number stays the same element.

const sameKind = (a: Node, b: Node): boolean =>
  a.nodeType === b.nodeType && (a.nodeType !== 1 || (a as Element).tagName === (b as Element).tagName);

const patchAttributes = (target: Element, source: Element): void => {
  for (const attr of Array.from(target.attributes)) {
    if (!source.hasAttribute(attr.name)) target.removeAttribute(attr.name);
  }
  for (const attr of Array.from(source.attributes)) {
    if (target.getAttribute(attr.name) !== attr.value) target.setAttribute(attr.name, attr.value);
  }
};

const patchChildren = (target: Node, source: Node): void => {
  const targetNodes = Array.from(target.childNodes);
  const sourceNodes = Array.from(source.childNodes);
  sourceNodes.forEach((next, index) => {
    const current = targetNodes[index];
    if (!current) {
      target.appendChild(next);
    } else if (!sameKind(current, next)) {
      target.replaceChild(next, current);
    } else if (current.nodeType === 1) {
      patchAttributes(current as Element, next as Element);
      patchChildren(current, next);
    } else if (current.nodeValue !== next.nodeValue) {
      current.nodeValue = next.nodeValue;
    }
  });
  for (const extra of targetNodes.slice(sourceNodes.length)) target.removeChild(extra);
};

/** Sets `el`'s content to `html`, reusing every existing node that still fits. */
export const patchHtmlInPlace = (el: Element, html: string): void => {
  const template = el.ownerDocument.createElement("template");
  template.innerHTML = html;
  patchChildren(el, template.content);
};
