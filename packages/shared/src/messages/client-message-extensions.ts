import { COSMETICS_CLIENT_MESSAGE_SCHEMAS } from "./cosmetics-messages.js";
import { SetTownFocusMessageSchema } from "../town-focus/town-focus-messages.js";

// Client message schemas defined beside messages.ts, which is at the
// file-line limit, gathered here for ClientMessageSchema's union.
export const EXTENSION_CLIENT_MESSAGE_SCHEMAS = [...COSMETICS_CLIENT_MESSAGE_SCHEMAS, SetTownFocusMessageSchema] as const;
