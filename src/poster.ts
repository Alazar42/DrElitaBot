import { Bot } from "grammy";
import { ApodPost } from "./types";
import { config } from "./config";
import { stateManager } from "./state";
import { fetchMediaAsInputFile } from "./media";
import { formatSinglePostCaption } from "./caption";

export class ChannelPoster {
  private bot: Bot;
  private channelId: string;

  constructor(bot: Bot, channelId: string = config.channelId) {
    this.bot = bot;
    this.channelId = channelId;
  }

  public setChannelId(channelId: string) {
    this.channelId = channelId;
  }

  public async postToChannel(post: ApodPost, force: boolean = false): Promise<boolean> {
    if (!this.channelId) {
      throw new Error("Cannot post: TELEGRAM_CHANNEL_ID is not configured in .env");
    }

    if (!force) {
      const evaluation = stateManager.evaluateApodPost(post, false);
      if (!evaluation.shouldPost) {
        console.log(`[INFO] [PASS] ${evaluation.message} Skipping posting.`);
        return false;
      }
    }

    console.log(`[INFO] Processing and posting APOD post ${post.id} (${post.dateStr} - "${post.title}") in one single post to ${this.channelId}...`);

    try {
      let sent = false;
      const caption = formatSinglePostCaption(post);

      // 1. Process & download image: try NASA HD image first, then Telegram channel photo
      const primaryPhotoUrl = post.hdUrl && post.hdUrl.match(/\.(jpe?g|png|webp)($|\?)/i) ? post.hdUrl : post.photoUrl;
      const fallbackPhotoUrl = post.photoUrl || post.hdUrl;
      const targetPhotoUrl = primaryPhotoUrl || fallbackPhotoUrl;

      if (targetPhotoUrl) {
        let inputFile = await fetchMediaAsInputFile(targetPhotoUrl, "apod.jpg");
        if (!inputFile && fallbackPhotoUrl && fallbackPhotoUrl !== targetPhotoUrl) {
          inputFile = await fetchMediaAsInputFile(fallbackPhotoUrl, "apod.jpg");
        }

        if (inputFile) {
          // Send photo with complete caption in a SINGLE post
          await this.bot.api.sendPhoto(this.channelId, inputFile, {
            caption,
            parse_mode: "HTML",
          });
          sent = true;
        }
      }

      // 2. If video exists and photo was not sent
      if (!sent && post.videoUrl) {
        try {
          await this.bot.api.sendVideo(this.channelId, post.videoUrl, {
            caption,
            parse_mode: "HTML",
          });
          sent = true;
        } catch (videoErr) {
          console.warn("[WARN] sendVideo failed, falling back to message:", videoErr);
        }
      }

      // 3. Fallback: single text message if media could not be fetched
      if (!sent) {
        await this.bot.api.sendMessage(this.channelId, post.cleanHtml, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: false },
        });
        sent = true;
      }

      // Update state upon success with complete history
      stateManager.savePosted(post);

      console.log(`[SUCCESS] Successfully posted APOD [${post.dateStr}] in one single post to ${this.channelId}`);
      return true;
    } catch (err: any) {
      console.error(`[ERROR] Failed to post APOD [${post.dateStr}] to channel:`, err?.message || err);

      // If HTML parsing failed on Telegram side, try fallback to plain text in a single post
      if (err?.description?.includes("can't parse entities")) {
        console.log("[INFO] Retrying with plain text format...");
        try {
          const plainText = `${post.dateStr} - ${post.nasaUrl}\n\n${post.rawText}`;
          await this.bot.api.sendMessage(this.channelId, plainText);

          stateManager.savePosted(post);
          console.log(`[SUCCESS] Posted fallback plain text to ${this.channelId}`);
          return true;
        } catch (retryErr) {
          console.error("[ERROR] Fallback plain text post also failed:", retryErr);
        }
      }

      throw err;
    }
  }
}
