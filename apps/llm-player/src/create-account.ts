// One-off provisioning script: registers the bot's own Firebase account so it
// has its own empire, separate from your player account. Run once:
//
//   pnpm --filter @border-empires/llm-player create-account
//
// Safe to re-run — if the account already exists this just confirms sign-in
// still works instead of erroring.
import { loadBotConfig } from "./config.js";
import { setBotDisplayName, signInBotAccount, signUpBotAccount } from "./firebase-auth.js";

const config = loadBotConfig();

try {
  const account = await signUpBotAccount(config.firebaseApiKey, config.botEmail, config.botPassword);
  await setBotDisplayName(config.firebaseApiKey, account.idToken, config.botDisplayName);
  console.log(`Created bot account ${account.email} (uid ${account.localId}), display name "${config.botDisplayName}".`);
  console.log("It will register as a new empire the first time it connects to the gateway.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("EMAIL_EXISTS")) {
    const account = await signInBotAccount(config.firebaseApiKey, config.botEmail, config.botPassword);
    await setBotDisplayName(config.firebaseApiKey, account.idToken, config.botDisplayName);
    console.log(`Account ${account.email} already exists (uid ${account.localId}) — display name set to "${config.botDisplayName}".`);
  } else {
    console.error(message);
    process.exitCode = 1;
  }
}
