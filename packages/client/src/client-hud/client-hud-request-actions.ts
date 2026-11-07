/** Shared social request binding, extracted from the HUD renderer. */
export function bindRequestActionButtons(
  hud: HTMLElement,
  sendGameMessage: (payload: unknown, message?: string) => boolean,
  selector: string,
  datasetKey: "requestId" | "truceRequestId",
  buildMessage: (id: string) => Record<string, unknown>,
  failureMessage: string
): void {
  hud.querySelectorAll<HTMLButtonElement>(selector).forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset[datasetKey];
      if (id) sendGameMessage(buildMessage(id), failureMessage);
    };
  });
}
