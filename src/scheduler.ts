import cron, { ScheduledTask } from "node-cron";
import { config } from "./config";
import { fetchApodPosts } from "./scraper";
import { ChannelPoster } from "./poster";
import { stateManager } from "./state";

export async function checkAndPostApod(poster: ChannelPoster): Promise<void> {
  const now = new Date();
  console.log(`[${now.toISOString()}] [INFO] Checking @apod_telegram for new APOD posts (Timezone: ${config.timezone})...`);
  try {
    const posts = await fetchApodPosts();
    if (posts.length === 0) {
      console.log("[INFO] No APOD posts found in source channel.");
      stateManager.saveState({});
      return;
    }

    const latest = posts[posts.length - 1];
    console.log(`[INFO] Found latest APOD in source: [${latest.dateStr}] - "${latest.title}" (Post ID: ${latest.id})`);

    const evaluation = stateManager.evaluateApodPost(latest, false);
    stateManager.saveState({});

    if (!evaluation.shouldPost) {
      console.log(`[INFO] [PASS] ${evaluation.message} Skipping.`);
      return;
    }

    console.log(`[INFO] [MATCH] ${evaluation.message} Proceeding to publish.`);
    await poster.postToChannel(latest, false);
  } catch (err: any) {
    console.error("[ERROR] Error during scheduled APOD check:", err?.message || err);
  }
}

export function startScheduler(poster: ChannelPoster): ScheduledTask {
  console.log(`[INFO] Starting cron scheduler with schedule: "${config.cronSchedule}"`);

  const task = cron.schedule(config.cronSchedule, async () => {
    await checkAndPostApod(poster);
  });

  return task;
}
