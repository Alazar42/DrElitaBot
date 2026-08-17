import { Bot } from "grammy";
import { config } from "./config";
import { getLatestApodPost } from "./scraper";
import { ChannelPoster } from "./poster";
import { fetchMediaAsInputFile } from "./media";
import { stateManager } from "./state";
import { formatSinglePostCaption } from "./caption";

export function createBot(): { bot: Bot; poster: ChannelPoster } {
  if (!config.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not defined in .env");
  }

  const bot = new Bot(config.botToken);
  const poster = new ChannelPoster(bot, config.channelId);

  // Channel post listener: Automatically record APODs that appear in the destination channel
  bot.on("channel_post", async (ctx) => {
    const chat = ctx.chat;
    if (!chat) return;

    const chatIdStr = String(chat.id);
    const normalizedTarget = config.channelId;

    if (chatIdStr === normalizedTarget || (chat.username && `@${chat.username}` === normalizedTarget)) {
      const text = ctx.channelPost.text || ctx.channelPost.caption || "";
      const dateMatch = text.match(/(\d{4}\s+[A-Za-z]+\s+\d{1,2})|([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
      const urlMatch = text.match(/https:\/\/apod\.nasa\.gov\/apod\/ap\d{6}\.html/i);

      if (dateMatch || urlMatch) {
        const dateStr = dateMatch ? dateMatch[0] : "";
        const nasaUrl = urlMatch ? urlMatch[0] : "";
        stateManager.markDateAsPosted(dateStr, nasaUrl, `channel_${ctx.channelPost.message_id}`);
        console.log(`[SYNC] Synchronized channel post for date [${dateStr || nasaUrl}] from target channel.`);
      }
    }
  });

  // Authorization middleware: Only allow whitelisted users if ALLOWED_USERS is defined
  bot.use(async (ctx, next) => {
    // Ignore channel posts and edited posts in general command router
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
/post_today - Check and post today's APOD to your channel (skips if today's APOD is not published yet or already posted)
/post_today force - Force post the latest APOD regardless of date/state
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

      const evaluation = stateManager.evaluateApodPost(post, false);
      let statusBadge = "";
      if (evaluation.reason === "already_posted") {
        statusBadge = "\n\n<i>[Status: Already posted to channel]</i>";
      } else if (evaluation.reason === "stale_data") {
        statusBadge = `\n\n<i>[Status: Past APOD (${post.dateStr}) - Today's ${evaluation.todayIso} post not published yet]</i>`;
      } else if (evaluation.reason === "new_post") {
        statusBadge = "\n\n<i>[Status: New post for today - Ready to publish]</i>";
      }

      const caption = formatSinglePostCaption(post) + statusBadge;

      // 1. Process & download image: try NASA HD image first, then Telegram preview photo
      const primaryPhotoUrl = post.hdUrl && post.hdUrl.match(/\.(jpe?g|png|webp)($|\?)/i) ? post.hdUrl : post.photoUrl;
      const fallbackPhotoUrl = post.photoUrl || post.hdUrl;
      const targetPhotoUrl = primaryPhotoUrl || fallbackPhotoUrl;

      if (targetPhotoUrl) {
        let inputFile = await fetchMediaAsInputFile(targetPhotoUrl, "apod.jpg");
        if (!inputFile && fallbackPhotoUrl && fallbackPhotoUrl !== targetPhotoUrl) {
          inputFile = await fetchMediaAsInputFile(fallbackPhotoUrl, "apod.jpg");
        }

        if (inputFile) {
          // Send all in one single photo post
          await ctx.replyWithPhoto(inputFile, {
            caption,
            parse_mode: "HTML",
          });
          return;
        }
      }

      // 2. If video exists
      if (post.videoUrl) {
        await ctx.replyWithVideo(post.videoUrl, {
          caption,
          parse_mode: "HTML",
        });
        return;
      }

      // 3. Fallback: text only
      await ctx.reply(post.cleanHtml + statusBadge, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: false },
      });
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

    const rawMatch = ctx.match || "";
    const isForce = rawMatch.toString().toLowerCase().includes("force") ||
      (ctx.message?.text || "").toLowerCase().includes("force");

    await ctx.reply(`Checking APOD for today (${config.timezone})...`, {
      parse_mode: "HTML",
    });

    try {
      const post = await getLatestApodPost();
      if (!post) {
        await ctx.reply("Could not find any APOD post in @apod_telegram.");
        return;
      }

      const evaluation = stateManager.evaluateApodPost(post, isForce);

      if (!evaluation.shouldPost) {
        if (evaluation.reason === "already_posted") {
          await ctx.reply(`APOD [${post.dateStr}] - "<b>${post.title}</b>" is already posted to the channel.`, {
            parse_mode: "HTML",
          });
          return;
        }

        if (evaluation.reason === "stale_data") {
          await ctx.reply(
            `Today is <b>${evaluation.todayIso}</b>, but the latest post in @apod_telegram is from <b>${post.dateStr}</b> (${evaluation.postIsoDate}).\n\n` +
            `NASA has not published today's APOD yet.\n\n` +
            `<i>To force post the latest available post anyway, send:</i>\n<code>/post_today force</code>`,
            { parse_mode: "HTML" }
          );
          return;
        }

        await ctx.reply(`APOD check skipped: ${evaluation.message}`);
        return;
      }

      const posted = await poster.postToChannel(post, isForce);
      if (posted) {
        await ctx.reply(`Successfully published APOD [${post.dateStr}] - "<b>${post.title}</b>" to <code>${config.channelId}</code>.`, {
          parse_mode: "HTML",
        });
      } else {
        await ctx.reply(`APOD [${post.dateStr}] was not posted.`);
      }
    } catch (err: any) {
      console.error("[ERROR] Failed handling /post_today command:", err);
      await ctx.reply(`Error posting to channel: ${err?.message || err}`);
    }
  });

  return { bot, poster };
}
