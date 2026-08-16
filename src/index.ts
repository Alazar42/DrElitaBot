import { config } from "./config";
import { createBot } from "./bot";
import { startScheduler, checkAndPostApod } from "./scheduler";

async function main() {
  console.log("[INFO] Starting DrElitaBot APOD Forwarder...");

  if (!config.botToken) {
    console.error("[FATAL] TELEGRAM_BOT_TOKEN is not defined in .env. Exiting.");
    process.exit(1);
  }

  const { bot, poster } = createBot();

  // Run initial check on startup if enabled and channel is set
  if (config.checkOnStartup) {
    if (config.channelId) {
      console.log("[INFO] Performing initial check on startup...");
      await checkAndPostApod(poster);
    } else {
      console.log("[INFO] Skipping startup post check because TELEGRAM_CHANNEL_ID is not configured in .env yet.");
    }
  }

  // Start cron scheduler
  const cronTask = startScheduler(poster);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[INFO] Stopping DrElitaBot...");
    cronTask.stop();
    bot.stop();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  // Start bot long polling for commands
  console.log(`[INFO] DrElitaBot is now listening for commands (Whitelisted users: ${config.allowedUsers.join(", ") || "All"}).`);
  await bot.start({
    onStart: (botInfo) => {
      console.log(`[INFO] Bot @${botInfo.username} started successfully.`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error in main process:", err);
  process.exit(1);
});