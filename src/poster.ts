import { Bot } from "grammy";
import { ApodPost } from "./types";
import { config } from "./config";
import { stateManager } from "./state";
import { fetchMediaAsInputFile } from "./media";

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

    if (!force && stateManager.isAlreadyPosted(post.id, post.dateStr)) {
      console.log(`[INFO] APOD post ${post.id} (${post.dateStr}) is already posted. Skipping.`);
      return false;
    }

    console.log(`[INFO] Posting APOD post ${post.id} (${post.dateStr} - "${post.title}") to ${this.channelId}...`);

    try {
      const htmlLength = post.cleanHtml.length;
      let sent = false;

      const mediaUrl = post.photoUrl || post.hdUrl;

      // 1. If photo exists, download and send buffer via InputFile with full caption
      if (mediaUrl) {
        const inputFile = await fetchMediaAsInputFile(mediaUrl, "apod.jpg");
        if (inputFile) {
          try {
            await this.bot.api.sendPhoto(this.channelId, inputFile, {
              caption: post.cleanHtml,
              parse_mode: "HTML",
            });
            sent = true;
          } catch (photoErr) {
            console.warn("[WARN] sendPhoto with InputFile failed, trying fallback:", photoErr);
          }
        }
      }

      // 2. If video exists and photo was not sent
      if (!sent && post.videoUrl) {
        try {
          await this.bot.api.sendVideo(this.channelId, post.videoUrl, {
            caption: post.cleanHtml,
            parse_mode: "HTML",
          });
          sent = true;
        } catch (videoErr) {
          console.warn("[WARN] sendVideo failed, falling back to message:", videoErr);
        }
      }

      // 3. Fallback: text only with link preview if neither photo nor video was sent
      if (!sent) {
        const previewUrl = post.photoUrl || post.hdUrl || post.nasaUrl;
        await this.bot.api.sendMessage(this.channelId, post.cleanHtml, {
          parse_mode: "HTML",
          link_preview_options: previewUrl
            ? {
                is_disabled: false,
                url: previewUrl,
                prefer_large_media: true,
                show_above_text: true,
              }
            : { is_disabled: false },
        });
        sent = true;
      }

      // Update state upon success
      stateManager.saveState({
        lastPostedId: post.id,
        lastPostedDate: post.dateStr,
      });

      console.log(`[SUCCESS] Successfully posted APOD [${post.dateStr}] to ${this.channelId}`);
      return true;
    } catch (err: any) {
      console.error(`[ERROR] Failed to post APOD [${post.dateStr}] to channel:`, err?.message || err);

      // If HTML parsing failed on Telegram side, try fallback to plain text
      if (err?.description?.includes("can't parse entities")) {
        console.log("[INFO] Retrying with plain text format...");
        try {
          const plainText = `${post.dateStr} - ${post.nasaUrl}\n\n${post.rawText}`;
          await this.bot.api.sendMessage(this.channelId, plainText, {
            link_preview_options: post.photoUrl
              ? {
                  is_disabled: false,
                  url: post.photoUrl,
                  prefer_large_media: true,
                  show_above_text: true,
                }
              : undefined,
          });

          stateManager.saveState({
            lastPostedId: post.id,
            lastPostedDate: post.dateStr,
          });
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
