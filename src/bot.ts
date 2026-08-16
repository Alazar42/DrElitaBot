import { Bot } from "grammy";
import { config } from "./config";
import { getLatestApodPost } from "./scraper";
import { ChannelPoster } from "./poster";
import { fetchMediaAsInputFile } from "./media";

export function createBot(): { bot: Bot; poster: ChannelPoster } {
  if (!config.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not defined in .env");
  }

  const bot = new Bot(config.botToken);
  const poster = new ChannelPoster(bot, config.channelId);

  // Authorization middleware: Only allow whitelisted users if ALLOWED_USERS is defined
  bot.use(async (ctx, next) => {
    // Ignore channel posts and edited posts completely so the bot doesn't interfere with channel publishing
    if (ctx.channelPost || ctx.editedChannelPost) {
      return;
    }

    const messageText = ctx.message?.text || ctx.message?.caption || "";
    const isCommand = messageText.startsWith("/");
    const isPrivate = ctx.chat?.type === "private";

    // Ignore regular conversation/posts in groups and supergroups that are not commands
    if (!isCommand && !isPrivate) {
      return;
    }

    const userId = ctx.from?.id;

    if (config.allowedUsers.length > 0) {
      if (!userId || !config.allowedUsers.includes(userId)) {
        console.warn(`[AUTH] Unauthorized command attempt from User ID: ${userId || "unknown"} (@${ctx.from?.username || "none"})`);
        if (isPrivate || isCommand) {
          await ctx.reply("Access denied. You are not authorized to use this bot.");
        }
        return;
      }
    }

    await next();
  });

  // Command: /start & /help
  bot.command(["start", "help"], async (ctx) => {
    const helpMessage = `<b>DrElitaBot - NASA APOD Forwarder</b>
Monitors <a href="https://t.me/apod_telegram">@apod_telegram</a> and forwards daily NASA Astronomy Picture of the Day posts directly to your channel.

<b>Commands:</b>
/post_today - Check and immediately post today's APOD to your channel
/latest - Preview the latest APOD post in chat
/help - Show this help message`;

    await ctx.reply(helpMessage, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  // Command: /latest
  bot.command("latest", async (ctx) => {
    await ctx.reply("Fetching latest APOD post from @apod_telegram...");
    try {
      const post = await getLatestApodPost();
      if (!post) {
        await ctx.reply("No APOD post found in recent messages.");
        return;
      }

      const mediaUrl = post.photoUrl || post.hdUrl;
      let sentMedia = false;

      if (mediaUrl) {
        const inputFile = await fetchMediaAsInputFile(mediaUrl, "apod.jpg");
        if (inputFile) {
          try {
            await ctx.replyWithPhoto(inputFile, {
              caption: post.cleanHtml,
              parse_mode: "HTML",
            });
            sentMedia = true;
          } catch (photoErr) {
            console.warn("[WARN] replyWithPhoto failed, falling back to message with preview:", photoErr);
          }
        }
      }

      if (!sentMedia) {
        await ctx.reply(post.cleanHtml, {
          parse_mode: "HTML",
          link_preview_options: post.photoUrl
            ? {
                is_disabled: false,
                url: post.photoUrl,
                prefer_large_media: true,
                show_above_text: true,
              }
            : { is_disabled: false },
        });
      }
    } catch (err: any) {
      console.error("[ERROR] Failed handling /latest command:", err);
      await ctx.reply(`Error fetching latest APOD: ${err?.message || err}`);
    }
  });

  // Command: /post_today
  bot.command("post_today", async (ctx) => {
    if (!config.channelId) {
      await ctx.reply("TELEGRAM_CHANNEL_ID is not configured in your .env file.");
      return;
    }

    await ctx.reply(`Checking and posting today's APOD to <code>${config.channelId}</code>...`, {
      parse_mode: "HTML",
    });

    try {
      const post = await getLatestApodPost();
      if (!post) {
        await ctx.reply("Could not find any APOD post to publish.");
        return;
      }

      const posted = await poster.postToChannel(post, false);
      if (posted) {
        await ctx.reply(`Successfully published APOD [${post.dateStr}] - "<b>${post.title}</b>" to <code>${config.channelId}</code>.`, {
          parse_mode: "HTML",
        });
      } else {
        await ctx.reply(`APOD [${post.dateStr}] - "${post.title}" is already posted to the channel.`, {
          parse_mode: "HTML",
        });
      }
    } catch (err: any) {
      console.error("[ERROR] Failed handling /post_today command:", err);
      await ctx.reply(`Error posting to channel: ${err?.message || err}`);
    }
  });

  return { bot, poster };
}
