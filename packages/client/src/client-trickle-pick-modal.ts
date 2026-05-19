// Lightweight one-off modal used when a domain (currently only Clockwork
// Stipend) requires the player to pick a single resource that will trickle
// forever. Resolves with the picked resource key on confirm, or `null` on
// cancel / backdrop click / escape.
//
// Kept deliberately self-contained — it mounts on document.body, removes
// itself on dismiss, and does not depend on the existing changelog overlay
// or HUD render cycle.

export type TrickleOption = {
  resource: string;
  ratePerMinute: number;
};

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const resourceFlavor: Record<string, string> = {
  IRON: "Forge & fort upkeep",
  SUPPLY: "Outpost upkeep & army logistics",
  CRYSTAL: "Research, observatories, shards"
};

// Per-instance suffix so element IDs (aria-labelledby targets, cancel button)
// never collide if a stray bug ever managed to render two modals at once.
// Avoid crypto.randomUUID because the modal also runs in older test environments.
let modalInstanceSequence = 0;
const nextModalInstanceId = (): string => `trickle-pick-${++modalInstanceSequence}`;

export const promptForTrickleResource = (
  options: { domainName: string; offered: TrickleOption[]; defaultResource?: string }
): Promise<string | null> => {
  if (typeof document === "undefined" || !document.body) return Promise.resolve(null);
  if (options.offered.length === 0) return Promise.resolve(null);

  return new Promise<string | null>((resolve) => {
    let resolved = false;
    const finish = (picked: string | null): void => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener("keydown", onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(picked);
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") finish(null);
    };

    const overlay = document.createElement("div");
    overlay.className = "trickle-pick-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9999",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:rgba(8,10,18,0.72)",
      // -webkit prefix kept for older Safari that needs the vendor name.
      "-webkit-backdrop-filter:blur(2px)",
      "backdrop-filter:blur(2px)"
    ].join(";");

    const instanceId = nextModalInstanceId();
    const titleId = `${instanceId}-title`;
    const cancelId = `${instanceId}-cancel`;

    const card = document.createElement("div");
    card.className = "trickle-pick-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", titleId);
    card.style.cssText = [
      "max-width:480px",
      "width:calc(100% - 32px)",
      // Cap at 90vh and let the body scroll so the modal never clips off the
      // viewport on small phones or when a future domain offers many options.
      "max-height:90vh",
      "overflow-y:auto",
      "padding:20px 22px 18px",
      "background:#161b29",
      "color:#e6e9f2",
      "border:1px solid #2a3247",
      "border-radius:10px",
      "box-shadow:0 14px 40px rgba(0,0,0,0.55)",
      "font-family:inherit"
    ].join(";");

    // Validate the default-resource key against a strict regex before letting
    // it back into a CSS selector below. Resource keys are always uppercase
    // ASCII (IRON / SUPPLY / CRYSTAL), so the regex doubles as documentation.
    const isValidResourceKey = (input: string | undefined): input is string =>
      typeof input === "string" && /^[A-Z_]+$/.test(input);
    const safeDefaultResource = isValidResourceKey(options.defaultResource) ? options.defaultResource : undefined;

    const offeredHtml = options.offered
      .map((option) => {
        const flavor = resourceFlavor[option.resource] ?? "";
        const isDefault = option.resource === safeDefaultResource;
        return `
          <button type="button"
                  class="trickle-pick-option"
                  data-resource="${escapeHtml(option.resource)}"
                  style="display:flex;flex-direction:column;align-items:flex-start;width:100%;padding:10px 12px;margin:6px 0;background:${isDefault ? "#23304a" : "#1c2335"};border:1px solid ${isDefault ? "#3a5286" : "#2a3247"};border-radius:8px;color:#e6e9f2;cursor:pointer;text-align:left;">
            <span style="font-weight:600;font-size:14px;letter-spacing:0.02em;">
              ${escapeHtml(option.resource)} <span style="color:#7a8aa8;font-weight:400;">+${option.ratePerMinute.toFixed(2)}/min</span>
            </span>
            ${flavor ? `<span style="font-size:12px;color:#9aa6c2;margin-top:2px;">${escapeHtml(flavor)}</span>` : ""}
          </button>
        `;
      })
      .join("");

    card.innerHTML = `
      <h2 id="${titleId}" style="margin:0 0 6px;font-size:18px;letter-spacing:0.01em;">
        ${escapeHtml(options.domainName)}
      </h2>
      <p style="margin:0 0 10px;color:#9aa6c2;font-size:13px;line-height:1.4;">
        Pick one resource. The chosen resource will trickle into your stockpile every tick, forever — this choice is <strong>locked</strong> the moment you confirm a domain.
      </p>
      <div class="trickle-pick-options" style="margin:8px 0 12px;">
        ${offeredHtml}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button type="button" id="${cancelId}" style="padding:8px 14px;background:transparent;border:1px solid #2a3247;color:#9aa6c2;border-radius:6px;cursor:pointer;">Cancel</button>
      </div>
    `;

    overlay.appendChild(card);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(null);
    });
    card.querySelectorAll<HTMLButtonElement>(".trickle-pick-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const picked = btn.dataset.resource ?? null;
        finish(picked);
      });
    });
    const cancelBtn = card.querySelector<HTMLButtonElement>(`#${cancelId}`);
    if (cancelBtn) cancelBtn.addEventListener("click", () => finish(null));

    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);

    // Focus the default option so keyboard users land somewhere sensible.
    // The CSS selector is safe because safeDefaultResource passed the strict
    // [A-Z_]+ regex above; no escaping needed.
    const defaultBtn = card.querySelector<HTMLButtonElement>(
      safeDefaultResource
        ? `.trickle-pick-option[data-resource="${safeDefaultResource}"]`
        : ".trickle-pick-option"
    );
    if (defaultBtn) defaultBtn.focus();
  });
};
