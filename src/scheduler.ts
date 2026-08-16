import cron, { ScheduledTask } from "node-cron";
import { config } from "./config";
import { fetchApodPosts } from "./scraper";
import { ChannelPoster } from "./poster";

export async function checkAndPostApod(poster: ChannelPoster): Promise<void> {
  console.log(`[${new Date().toISOString()}] [INFO] Checking @apod_telegram for new APOD posts...`);
  try {
    const posts = await fetchApodPosts();
    if (posts.length === 0) {
      console.log("[INFO] No APOD posts found in source channel.");
      return;
    }

    const latest = posts[posts.length - 1];
    console.log(`[INFO] Found latest APOD: [${latest.dateStr}] - "${latest.title}" (Post ID: ${latest.id})`);

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
