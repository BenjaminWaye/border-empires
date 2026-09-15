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
  /** POPULATION only: the name of the town that received the burst. Absent if the town had no name set, or (rarely) if the server's DB predates this field -- falls back to generic "your nearest town" copy. */
  grantedTownName?: string;
  onJumpToLocation: () => void;
};

const RESOURCE_LABEL: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", string> = {
  FOOD: "Food",
  TITANIUM: "Titanium",
  CRYSTAL: "Crystal",
  UMBRITE: "Umbrite"
};

/**
 * The "why am I seeing this" line -- one sentence of in-world flavor
 * explaining what the waystation actually did, distinct from the concrete
 * modifier line below it. Returns undefined for the same no-op cases
 * modifierForEffect does (see there); the two are always undefined together.
 */
const narrativeForEffect = (info: WaystationActivationInfo): string | undefined => {
  if (info.grantedEffect === "VISION") {
    return info.revealedTown
      ? "Scouts stationed at the waystation spotted a nearby settlement and marked its coordinates on your maps."
      : "Scouts stationed at the waystation surveyed the surrounding land and charted it for you.";
  }
  if (info.grantedEffect === "POPULATION") {
    const destination = info.grantedTownName ? `into ${info.grantedTownName}` : "into your nearest town";
    return `The waystation's populace has thrown in with your empire, packing up and moving ${destination}.`;
  }
  if (info.grantedEffect === "TECH") {
    return info.grantedTechName ? "Waystation engineers shared their research findings with your scholars." : undefined;
  }
  if (info.grantedEffect === "RESOURCE_SLOT") {
    return info.grantedResource ? "The waystation's stockpiles and storage rigs were folded into your empire's supply lines." : undefined;
  }
  return undefined;
};

/**
 * The concrete "Modifiers: ..." line -- the actual numeric/unlock effect,
 * kept separate from the narrative sentence above so the popup reads like
 * "here's what happened, and here's exactly what you got" rather than
 * burying the number in prose. Returns undefined when the effect has
 * nothing worth showing -- a TECH grant that resolved to nothing (the
 * player already owned every tier-1 tech) is a silent no-op from the
 * player's perspective, matching the server's own "consume the activation,
 * grant nothing" fallback.
 */
const modifierForEffect = (info: WaystationActivationInfo): string | undefined => {
  if (info.grantedEffect === "VISION") {
    return info.revealedTown ? "Revealed: nearby town location" : "Revealed: surrounding tiles";
  }
  if (info.grantedEffect === "POPULATION") {
    return `+${WAYSTATION_POP_BURST.toLocaleString()} Population`;
  }
  if (info.grantedEffect === "TECH") {
    return info.grantedTechName ? `Unlocked: ${info.grantedTechName}` : undefined;
  }
  if (info.grantedEffect === "RESOURCE_SLOT") {
    return info.grantedResource ? `+1 ${RESOURCE_LABEL[info.grantedResource]} Resource Slot` : undefined;
  }
  return undefined;
};

export const showWaystationActivationOverlay = (info: WaystationActivationInfo): void => {
  const narrative = narrativeForEffect(info);
  const modifier = modifierForEffect(info);
  if (!narrative || !modifier) return; // TECH-no-op fallback: nothing was actually granted, so no popup.

  const existing = document.getElementById("waystation-activation-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "waystation-activation-overlay";
  overlay.innerHTML = overlayHtml(info, narrative, modifier);

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

const overlayHtml = (info: WaystationActivationInfo, narrative: string, modifier: string): string => `
    <div id="waystation-activation-backdrop"></div>
    <div id="waystation-activation-modal">
      <div id="waystation-activation-hero">${heroSvg}
        <div id="waystation-activation-hero-fade"></div>
        <div id="waystation-activation-eyebrow">Waystation Activated</div>
        <div id="waystation-activation-meta">(${info.x}, ${info.y})</div>
      </div>
      <button id="waystation-activation-close" class="waystation-activation-close-btn" type="button" aria-label="Close">&#10005;</button>
      <div id="waystation-activation-body">
        <div id="waystation-activation-narrative">${escapeHtml(narrative)}</div>
        <div id="waystation-activation-modifier">${escapeHtml(modifier)}</div>
        ${showJumpButton(info) ? `<button id="waystation-activation-jump" class="waystation-activation-jump-btn" type="button">Jump to Location</button>` : ""}
      </div>
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
  position: relative; display: grid; grid-template-rows: auto auto;
  width: min(420px, calc(100vw - 32px)); border-radius: 20px; overflow: hidden;
  border: 1px solid rgba(230, 178, 106, 0.32);
  background: linear-gradient(180deg, rgba(24,17,10,0.98), rgba(14,10,6,0.98));
  box-shadow: 0 28px 80px rgba(0,0,0,0.5), 0 0 60px rgba(214,150,68,0.14);
  color: #fbf3e6;
  animation: waystationActivationEnter 0.4s cubic-bezier(0.16,1,0.3,1) both;
}
#waystation-activation-hero { position: relative; width: 100%; height: 140px; overflow: hidden; }
#waystation-activation-hero svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#waystation-activation-hero-fade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(20,13,6,0) 40%, rgba(15,10,5,0.92) 100%);
}
#waystation-activation-eyebrow {
  position: absolute; left: 20px; top: 16px; font-size: 11px; font-weight: 800; letter-spacing: 0.18em;
  text-transform: uppercase; color: rgba(255, 214, 148, 0.92);
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
#waystation-activation-meta {
  position: absolute; left: 20px; bottom: 12px; font-size: 12.5px; font-weight: 600;
  color: rgba(255, 232, 197, 0.86); text-shadow: 0 2px 8px rgba(0,0,0,0.7);
}
.waystation-activation-close-btn {
  position: absolute; top: 12px; right: 12px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 999px;
  border: 1px solid rgba(255,224,180,0.4); background: rgba(20,13,6,0.56);
  color: #fbf3e6; font-size: 13px; font-weight: 800; line-height: 1; cursor: pointer;
}
.waystation-activation-close-btn:hover { background: rgba(30,20,10,0.78); }
#waystation-activation-body { display: grid; gap: 10px; padding: 18px 22px 22px; }
#waystation-activation-narrative { font-size: 14px; line-height: 1.5; color: rgba(240, 224, 200, 0.86); }
#waystation-activation-modifier { font-size: 15px; font-weight: 800; color: #a9e8a0; }
.waystation-activation-jump-btn {
  justify-self: start; padding: 10px 18px; border-radius: 12px; border: 1px solid rgba(255,214,148,0.5);
  background: linear-gradient(180deg, rgba(255,214,148,0.22), rgba(214,150,68,0.14));
  color: #ffe6b8; font-size: 13.5px; font-weight: 800; cursor: pointer;
}
.waystation-activation-jump-btn:hover { background: linear-gradient(180deg, rgba(255,214,148,0.32), rgba(214,150,68,0.22)); }
@media (max-width: 420px) {
  #waystation-activation-hero { height: 120px; }
}
@keyframes waystationActivationEnter {
  0% { opacity: 0; transform: scale(0.9) translateY(14px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}`;

/**
 * Dormant-to-activated frontier rig, drawn to match the town-capture hero's
 * silhouette-against-dusk style: riveted base plate, banded mast, caged lens
 * (glowing cyan -- the lit "activated" state per the Waystation design),
 * roofed shelter, and crates/barrel at the base.
 */
const heroSvg = `<svg viewBox="0 0 520 168" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wsSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#241a12"/>
      <stop offset="55%" stop-color="#4a3420"/>
      <stop offset="100%" stop-color="#8a6236"/>
    </linearGradient>
    <radialGradient id="wsLensGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#aef2ff"/>
      <stop offset="100%" stop-color="#4fd8f0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="520" height="168" fill="url(#wsSky)"/>
  <path d="M0 130 Q140 112 260 124 T520 116 V168 H0 Z" fill="#241708" opacity="0.9"/>
  <g fill="#1c130a">
    <rect x="70" y="120" width="40" height="12" rx="2"/>
    <rect x="78" y="132" width="24" height="8"/>
  </g>
  <ellipse cx="90" cy="140" rx="14" ry="6" fill="#150d05"/>
  <g fill="#17100a">
    <rect x="150" y="98" width="46" height="34" rx="2"/>
    <polygon points="146,98 200,98 173,80"/>
    <rect x="168" y="112" width="10" height="20"/>
  </g>
  <rect x="256" y="76" width="8" height="56" fill="#1c130a"/>
  <g stroke="#1c130a" stroke-width="3" opacity="0.85">
    <line x1="252" y1="90" x2="268" y2="90"/>
    <line x1="252" y1="108" x2="268" y2="108"/>
    <line x1="252" y1="122" x2="268" y2="122"/>
  </g>
  <rect x="238" y="126" width="44" height="10" rx="2" fill="#170f08"/>
  <circle cx="260" cy="62" r="26" fill="url(#wsLensGlow)"/>
  <circle cx="260" cy="62" r="11" fill="#bdf5ff" opacity="0.95"/>
  <circle cx="260" cy="62" r="11" fill="none" stroke="#1c130a" stroke-width="3"/>
  <g stroke="#1c130a" stroke-width="2.4" opacity="0.9">
    <line x1="260" y1="49" x2="260" y2="41"/>
    <line x1="260" y1="75" x2="260" y2="83"/>
    <line x1="247" y1="62" x2="239" y2="62"/>
    <line x1="273" y1="62" x2="281" y2="62"/>
    <line x1="250" y1="52" x2="244" y2="46"/>
    <line x1="270" y1="72" x2="276" y2="78"/>
    <line x1="270" y1="52" x2="276" y2="46"/>
    <line x1="250" y1="72" x2="244" y2="78"/>
  </g>
  <line x1="260" y1="41" x2="260" y2="30" stroke="#1c130a" stroke-width="3"/>
  <line x1="252" y1="32" x2="268" y2="30" stroke="#1c130a" stroke-width="3"/>
  <g fill="#1c130a">
    <rect x="330" y="118" width="28" height="22"/>
    <rect x="362" y="112" width="22" height="28"/>
    <circle cx="410" cy="128" r="16"/>
    <rect x="404" y="112" width="12" height="10"/>
  </g>
  <g stroke="#0f0904" stroke-width="2" opacity="0.6">
    <line x1="335" y1="118" x2="335" y2="140"/>
    <line x1="352" y1="118" x2="352" y2="140"/>
    <line x1="410" y1="112" x2="410" y2="144"/>
    <line x1="394" y1="128" x2="426" y2="128"/>
  </g>
  <path d="M0 148 Q140 132 260 144 T520 134 V168 H0 Z" fill="#140c05"/>
</svg>`;
