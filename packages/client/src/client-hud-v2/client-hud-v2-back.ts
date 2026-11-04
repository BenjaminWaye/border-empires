// The phone's back gesture for the compact HUD: each open sheet or screen
// pushes one history entry, and a back press closes the newest one. Closing
// from the UI drops that entry again without the pop closing anything else.

type BackHistory = Pick<History, "pushState" | "back">;
type BackWindow = Pick<Window, "addEventListener">;

export type BackHandle = {
  /** Closed from the UI: pop this entry's history state. Safe to call more than once. */
  release: () => void;
};

type Entry = { onBack: () => void; history: BackHistory; live: boolean };

const stack: Entry[] = [];
let listening = false;
let ignorePops = 0;

const onPopState = (): void => {
  if (ignorePops > 0) {
    ignorePops -= 1;
    return;
  }
  const top = stack.pop();
  if (!top) return;
  top.live = false;
  top.onBack();
};

export const backStackDepth = (): number => stack.length;

/** Registers `onBack` to run when the player presses back while this is the newest entry. */
export const pushBackEntry = (onBack: () => void, history: BackHistory = window.history, win: BackWindow = window): BackHandle => {
  if (!listening) {
    win.addEventListener("popstate", onPopState);
    listening = true;
  }
  const entry: Entry = { onBack, history, live: true };
  history.pushState({ hudV2Back: stack.length + 1 }, "");
  stack.push(entry);
  return {
    release: () => {
      if (!entry.live) return;
      entry.live = false;
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      ignorePops += 1;
      entry.history.back();
    }
  };
};
