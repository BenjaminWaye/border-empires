import { WAYSTATION_POP_BURST } from "@border-empires/shared";

export type WaystationGrantedEffect = "VISION" | "POPULATION" | "TECH" | "RESOURCE_SLOT";

export type WaystationActivationInfo = {
  x: number;
  y: number;
  grantedEffect: WaystationGrantedEffect;
  /** VISION only: the (x, y) actually revealed -- a nearby town, or the waystation's own tile as a fallback. */
  revealedAtX?: number;
  revealedAtY?: number;
  /** VISION only: true when revealedAtX/Y point at a town rather than the waystation's own tile (enables the "Jump to location" button and the town-specific copy). */
  revealedTown: boolean;
  /** TECH only: display name of the granted tech, looked up from the client's tech catalog. Absent tech id or absent name both suppress the popup entirely (see showWaystationActivationOverlay). */
  grantedTechName?: string;
  /** RESOURCE_SLOT only: which resource received the +1 slot bump. */
  grantedResource?: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
  onJumpToLocation: () => void;
};

const RESOURCE_LABEL: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", string> = {
  FOOD: "Food",
  TITANIUM: "Titanium",
  CRYSTAL: "Crystal",
  UMBRITE: "Umbrite"
};

/**
 * Result copy for each of the four possible Waystation rewards. Returns
 * undefined when the effect has nothing worth showing -- a TECH grant that
 * resolved to nothing (the player already owned every tier-1 tech) is a
 * silent no-op from the player's perspective, matching the server's own
 * "consume the activation, grant nothing" fallback.
 */
const bodyForEffect = (info: WaystationActivationInfo): string | undefined => {
  if (info.grantedEffect === "VISION") {
    return info.revealedTown
      ? "You've received a map of town coordinates nearby!"
      : "You've revealed the surrounding land.";
  }
  if (info.grantedEffect === "POPULATION") {
    return `Your nearest town received a population boost of +${WAYSTATION_POP_BURST.toLocaleString()}.`;
  }
  if (info.grantedEffect === "TECH") {
    return info.grantedTechName ? `You've unlocked ${info.grantedTechName} outright!` : undefined;
  }
  if (info.grantedEffect === "RESOURCE_SLOT") {
    return info.grantedResource ? `Your empire gained +1 ${RESOURCE_LABEL[info.grantedResource]} resource slot.` : undefined;
  }
  return undefined;
};

export const showWaystationActivationOverlay = (info: WaystationActivationInfo): void => {
  const body = bodyForEffect(info);
  if (!body) return; // TECH-no-op fallback: nothing was actually granted, so no popup.

  const existing = document.getElementById("waystation-activation-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "waystation-activation-overlay";
  overlay.innerHTML = overlayHtml(info, body);

  injectStyles();
  document.body.appendChild(overlay);
  overlay.style.display = "grid";

  const dismiss = (): void => { overlay.remove(); };

  overlay.querySelector("#waystation-activation-close")?.addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });
  overlay.querySelector("#waystation-activation-jump")?.addEventListener("click", () => {
    info.onJumpToLocation();
    dismiss();
  });
};

const showJumpButton = (info: WaystationActivationInfo): boolean => info.grantedEffect === "VISION" && info.revealedTown;

const overlayHtml = (info: WaystationActivationInfo, body: string): string => `
    <div id="waystation-activation-backdrop"></div>
    <div id="waystation-activation-modal">
      <div id="waystation-activation-eyebrow">Waystation Activated</div>
      <button id="waystation-activation-close" class="waystation-activation-close-btn" type="button" aria-label="Close">&#10005;</button>
      <div id="waystation-activation-meta">(${info.x}, ${info.y})</div>
      <div id="waystation-activation-body">${escapeHtml(body)}</div>
      ${showJumpButton(info) ? `<button id="waystation-activation-jump" class="waystation-activation-jump-btn" type="button">Jump to Location</button>` : ""}
    </div>`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

let injected = false;
const injectStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
};

const styles = `
#waystation-activation-overlay {
  position: fixed; inset: 0; display: none; place-items: center; padding: 16px; z-index: 32;
}
#waystation-activation-backdrop {
  position: absolute; inset: 0; background: rgba(10, 6, 1, 0.72); backdrop-filter: blur(4px);
}
#waystation-activation-modal {
  position: relative; display: grid; gap: 12px;
  width: min(420px, calc(100vw - 32px)); border-radius: 20px; padding: 22px;
  border: 1px solid rgba(230, 178, 106, 0.32);
  background: linear-gradient(180deg, rgba(24,17,10,0.98), rgba(14,10,6,0.98));
  box-shadow: 0 28px 80px rgba(0,0,0,0.5), 0 0 60px rgba(214,150,68,0.14);
  color: #fbf3e6;
  animation: waystationActivationEnter 0.4s cubic-bezier(0.16,1,0.3,1) both;
}
#waystation-activation-eyebrow {
  font-size: 11px; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: rgba(255, 214, 148, 0.92);
}
#waystation-activation-meta { font-size: 12.5px; font-weight: 600; color: rgba(255, 232, 197, 0.7); }
#waystation-activation-body { font-size: 15px; line-height: 1.5; color: #fbf3e6; }
.waystation-activation-close-btn {
  position: absolute; top: 12px; right: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 999px;
  border: 1px solid rgba(255,224,180,0.4); background: rgba(20,13,6,0.56);
  color: #fbf3e6; font-size: 13px; font-weight: 800; line-height: 1; cursor: pointer;
}
.waystation-activation-close-btn:hover { background: rgba(30,20,10,0.78); }
.waystation-activation-jump-btn {
  justify-self: start; padding: 10px 18px; border-radius: 12px; border: 1px solid rgba(255,214,148,0.5);
  background: linear-gradient(180deg, rgba(255,214,148,0.22), rgba(214,150,68,0.14));
  color: #ffe6b8; font-size: 13.5px; font-weight: 800; cursor: pointer;
}
.waystation-activation-jump-btn:hover { background: linear-gradient(180deg, rgba(255,214,148,0.32), rgba(214,150,68,0.22)); }
@keyframes waystationActivationEnter {
  0% { opacity: 0; transform: scale(0.9) translateY(14px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}`;
