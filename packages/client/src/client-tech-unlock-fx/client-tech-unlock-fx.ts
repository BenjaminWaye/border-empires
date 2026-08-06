// Tech-tree redesign: a short, building-agnostic "juice" moment when a tech
// is researched. Techs unlock instantly on payment (no research-duration
// countdown), so this is a completion-moment effect, not a progress bar --
// per the design plan's engagement-audit section citing Jonasson & Purho's
// "Juice It or Lose It." Deliberately generic (a screen-level flash +
// confetti burst), not tied to any specific building's visual, so it can't
// conflict with the 3D/2D overlay work being done separately for the new
// Manpower buildings (see PR #1176, branch agent/manpower-overlays).
//
// Pure DOM/CSS, no canvas/3D dependency -- safe to keep here rather than in
// any of the map-rendering modules.

const CONFETTI_COLORS = ["#ff9f9f", "#ffd166", "#84f2b8", "#9fb8ff", "#ffffff"];
const CONFETTI_PIECE_COUNT = 24;
const CONFETTI_LIFETIME_MS = 1400;

let styleInjected = false;

const injectStyleOnce = (): void => {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
@keyframes techUnlockConfettiFall {
  0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
  100% { transform: translateY(60vh) rotate(360deg); opacity: 0; }
}
@keyframes techUnlockFlash {
  0% { opacity: 0; }
  15% { opacity: 0.35; }
  100% { opacity: 0; }
}
.tech-unlock-fx-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  overflow: hidden;
}
.tech-unlock-fx-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 20%, #ffe9a8, transparent 60%);
  animation: techUnlockFlash 700ms ease-out forwards;
}
.tech-unlock-fx-piece {
  position: absolute;
  top: -12px;
  width: 8px;
  height: 14px;
  border-radius: 2px;
  animation-name: techUnlockConfettiFall;
  animation-timing-function: ease-in;
  animation-fill-mode: forwards;
}
`;
  document.head.appendChild(style);
};

/**
 * Fires a brief confetti + flash burst near the top of the viewport. Call
 * this whenever a CHOOSE_TECH command resolves into a newly-owned tech id
 * (see client-network.ts's TECH_UPDATE handler) -- once per newly-researched
 * tech, not per tech catalog refresh.
 */
export const triggerTechUnlockFx = (): void => {
  if (typeof document === "undefined") return;
  injectStyleOnce();
  const overlay = document.createElement("div");
  overlay.className = "tech-unlock-fx-overlay";
  const flash = document.createElement("div");
  flash.className = "tech-unlock-fx-flash";
  overlay.appendChild(flash);
  for (let i = 0; i < CONFETTI_PIECE_COUNT; i += 1) {
    const piece = document.createElement("div");
    piece.className = "tech-unlock-fx-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
    piece.style.animationDuration = `${900 + Math.random() * 500}ms`;
    piece.style.animationDelay = `${Math.random() * 150}ms`;
    overlay.appendChild(piece);
  }
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), CONFETTI_LIFETIME_MS);
};
