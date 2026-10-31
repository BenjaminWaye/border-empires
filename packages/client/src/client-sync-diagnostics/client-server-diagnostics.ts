import { getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

// Reads the existing Firebase app lazily, also covering bug/respawn report
// callers. Never copy an ID token into an exported object or error message.
export const diagnosticAuthorization = async (): Promise<string | undefined> => {
  const app = getApps()[0];
  const user = app ? getAuth(app).currentUser : undefined;
  return user ? `Bearer ${await user.getIdToken()}` : undefined;
};
