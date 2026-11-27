// The guide card steps aside while an alert ("Action failed", "Insufficient coin", ...) is up. The alert
// lives inside #hud, which is position: fixed and so its own stacking context: no z-index inside it can
// lift the alert over a body-level layer like the guide card (z-index 23, 48 over a panel), so the card
// covered it ("Action failed" half hidden, playtest 2026-11-27). The card also came back the moment a
// dialog closed, right over an error just shown. It now stays hidden until the alert is gone.

const ROOT_ID = "tutorial-guide-root";
export const GUIDE_ALERT_YIELD_CLASS = "tg-yield-alert";

/** True while the capture card shows an alert (client-capture-effects.ts sets data-state only for alerts, not progress). */
export const alertCardShowing = (doc: Document): boolean => {
  const card = doc.getElementById("capture-card");
  return Boolean(card?.dataset.state) && card!.style.display !== "" && card!.style.display !== "none";
};

/** Called every frame; a class toggle is cheap. */
export const syncGuideCardAlertYield = (doc: Document = document): void => {
  doc.getElementById(ROOT_ID)?.classList.toggle(GUIDE_ALERT_YIELD_CLASS, alertCardShowing(doc));
};
