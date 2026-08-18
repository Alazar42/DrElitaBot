import { config } from "./config";
import { createBot } from "./bot";

async function main() {
  console.log("[INFO] Starting DrElitaBot APOD Forwarder (Manual Mode)...");

  if (!config.botToken) {
    console.error("[FATAL] TELEGRAM_BOT_TOKEN is not defined in .env. Exiting.");
    process.exit(1);
  }

  const { bot } = createBot();

  // Register command list with Telegram
  try {
    await bot.api.setMyCommands([
      { command: "latest", description: "Preview latest NASA APOD with Post / Cancel buttons" },
      { command: "help", description: "Show bot information and available commands" },
    ]);
    console.log("[INFO] Telegram command menu registered successfully (/latest, /help).");
  } catch (cmdErr) {
    console.warn("[WARN] Could not register bot command list with Telegram:", cmdErr);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[INFO] Stopping DrElitaBot...");
    bot.stop();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  // Start bot long polling for commands
  console.log(`[INFO] DrElitaBot is now listening for commands: /latest, /help (Whitelisted users: ${config.allowedUsers.join(", ") || "All"}).`);
  await bot.start({
    onStart: (botInfo) => {
      console.log(`[INFO] Bot @${botInfo.username} started successfully in manual posting mode.`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error in main process:", err);
  process.exit(1);
});