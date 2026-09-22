import { GUIDE_AUTO_OPEN_STORAGE_KEY, GUIDE_STORAGE_KEY } from "../client-constants.js";
import { storageGet } from "./client-state.js";

// Extracted from client-state.ts's createInitialState (which is over the
// 500-line file-size limit) to keep that file from growing further.
export const createInitialGuideState = () => ({
  guide: {
    open: storageGet(GUIDE_STORAGE_KEY) !== "1",
    stepIndex: 0,
    completed: storageGet(GUIDE_STORAGE_KEY) === "1",
    autoOpened: storageGet(GUIDE_AUTO_OPEN_STORAGE_KEY) === "1"
  }
});
