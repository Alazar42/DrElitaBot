import type { IncomingMessage, ServerResponse } from "http";
import { createBot } from "../src/bot";
import { checkAndPostApod } from "../src/scheduler";
import { stateManager } from "../src/state";

const { poster } = createBot();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // Optional: Protect cron endpoint if CRON_SECRET is configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers["authorization"];
      if (authHeader !== `Bearer ${cronSecret}`) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    console.log("[INFO] [CRON] Vercel Cron trigger received. Checking for new APOD post...");

    // Sync remote state if KV is configured
    await stateManager.syncWithRemoteState();

    // Perform check and post
    await checkAndPostApod(poster);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: true,
        message: "APOD cron check completed successfully.",
        timestamp: new Date().toISOString(),
        state: stateManager.getState(),
      })
    );
  } catch (err: any) {
    console.error("[ERROR] [CRON] Failed during Vercel Cron execution:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
      })
    );
  }
}
