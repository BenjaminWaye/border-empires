// While a payment dispute (chargeback) of theirs is open, an account cannot
// buy again (Terms of Sale section 9, plan Q2). The pause lifts when the
// payment provider reports the dispute closed, whatever its outcome; the
// owner decides anything further by hand.
export const PURCHASES_PAUSED_MESSAGE =
  "Purchases are paused for this account while a payment dispute is open. Contact us at benjamin@borderempires.com if you think this is a mistake.";
