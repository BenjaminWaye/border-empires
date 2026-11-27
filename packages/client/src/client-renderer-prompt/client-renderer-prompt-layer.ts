// The "3D is running slow" prompt sat in #hud with no layout of its own: #hud is position: fixed, so its own
// stacking context, and the HUD's boxes (Dev 0/3, Victory race) and the charge cards covered the prompt's title
// and its "Switch to 2D" button (playtest 2026-11-27). Moved to <body> and drawn as a fixed modal above the HUD.
import "./client-renderer-prompt-layer.css";

/** Moves the prompt's overlay out of #hud to <body>, once, so its z-index (client-renderer-prompt-layer.css) beats the HUD. */
export const liftRendererPromptOverlay = (overlayEl: HTMLElement): void => {
  if (typeof document === "undefined" || overlayEl.parentElement === document.body) return;
  document.body.appendChild(overlayEl);
};
