import { ApodPost } from "./types";

const APOD_TELEGRAM_URL = "https://t.me/s/apod_telegram";

export function cleanTelegramHtml(rawHtml: string): string {
  let html = rawHtml;

  // Replace <br> and <br/> with newline
  html = html.replace(/<br\s*\/?>/gi, "\n");

  // Replace emoji blocks <tg-emoji ...><i class="emoji" ...><b>EMOJI</b></i></tg-emoji> with just EMOJI
  html = html.replace(/<tg-emoji[^>]*><i[^>]*><b>([\s\S]*?)<\/b><\/i><\/tg-emoji>/gi, "$1");
  html = html.replace(/<i class="emoji"[^>]*><b>([\s\S]*?)<\/b><\/i>/gi, "$1");
  html = html.replace(/<\/?tg-emoji[^>]*>/gi, "");

  // Normalize <a> tags, keeping only the href attribute
  html = html.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, text) => {
    return `<a href="${href}">${text}</a>`;
  });

  // Strip unsupported wrapper tags (e.g., spans, divs)
  html = html.replace(/<\/?span[^>]*>/gi, "");
  html = html.replace(/<\/?div[^>]*>/gi, "");

  return html.trim();
}

export function parseApodPost(block: string): ApodPost | null {
  const postMatch = block.match(/data-post="apod_telegram\/(\d+)"/);
  if (!postMatch) return null;
  const id = postMatch[1];

  const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!textMatch) return null;
  const rawHtml = textMatch[1];

  // Match the date header link: [YYYY Month DD](https://apod.nasa.gov/apod/ap...)
  // e.g. <a href="https://apod.nasa.gov/apod/ap260816.html">2026 August 16</a>
  const dateMatch = rawHtml.match(/<a\s+[^>]*href="(https:\/\/apod\.nasa\.gov\/apod\/ap[^"]+\.html)"[^>]*>(\d{4}\s+[A-Za-z]+\s+\d{1,2})<\/a>/i);
  
  let nasaUrl = "";
  let dateStr = "";

  if (dateMatch) {
    nasaUrl = dateMatch[1];
    dateStr = dateMatch[2];
  } else {
    // Fallback: check if any link has the "YYYY Month DD" pattern
    const fallbackMatch = rawHtml.match(/<a\s+[^>]*href="([^"]+)"[^>]*>(\d{4}\s+[A-Za-z]+\s+\d{1,2})<\/a>/i);
    if (!fallbackMatch) {
      return null;
    }
    nasaUrl = fallbackMatch[1];
    dateStr = fallbackMatch[2];
  }

  // Extract photo URL if present in the message preview
  const photoMatch = block.match(/tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:url\('([^']+)'\)/);
  const photoUrl = photoMatch ? photoMatch[1] : undefined;

  // Extract video URL if present
  const videoMatch = block.match(/<video[^>]*src="([^"]+)"/);
  const videoUrl = videoMatch ? videoMatch[1] : undefined;

  // Extract HD image/video link if present
  const hdMatch = rawHtml.match(/<a\s+[^>]*href="([^"]+)"[^>]*><b><i>HD<\/i><\/b><\/a>|<a\s+[^>]*href="([^"]+)"[^>]*><b><i>Annotated<\/i><\/b><\/a>|<a\s+[^>]*href="([^"]+)"[^>]*>[^<]*HD[^<]*<\/a>/i);
  const hdUrl = hdMatch ? (hdMatch[1] || hdMatch[2] || hdMatch[3]) : undefined;

  // Extract Discuss link if present
  const discussMatch = rawHtml.match(/<a\s+[^>]*href="([^"]+)"[^>]*><b><i>Discuss<\/i><\/b><\/a>|<a\s+[^>]*href="([^"]+)"[^>]*>[^<]*Discuss[^<]*<\/a>/i);
  const discussUrl = discussMatch ? (discussMatch[1] || discussMatch[2]) : undefined;

  // Format clean HTML for Telegram Bot API
  const cleanHtml = cleanTelegramHtml(rawHtml);

  // Extract Title (typically in the <b> tag after the date header)
  let title = "";
  const titleMatch = cleanHtml.match(/<a [^>]*>.*?<\/a>\s*\n*\s*<b>(.*?)<\/b>/s);
  if (titleMatch) {
    title = titleMatch[1].split("\n")[0].replace(/<[^>]+>/g, "").trim();
  }

  const rawText = cleanHtml.replace(/<[^>]+>/g, "");

  return {
    id,
    dateStr,
    nasaUrl,
    title,
    cleanHtml,
    rawText,
    photoUrl,
    videoUrl,
    hdUrl,
    discussUrl,
  };
}

export async function fetchApodPosts(): Promise<ApodPost[]> {
  try {
    const response = await fetch(APOD_TELEGRAM_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch APOD channel: HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const messageRegex = /<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|$)/g;
    const matches = [...html.matchAll(messageRegex)];

    const posts: ApodPost[] = [];
    for (const match of matches) {
      const post = parseApodPost(match[0]);
      if (post) {
        posts.push(post);
      }
    }

    // Sort ascending by ID (oldest to newest)
    posts.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
    return posts;
  } catch (error) {
    console.error("Error fetching APOD posts from Telegram:", error);
    throw error;
  }
}

export async function getLatestApodPost(): Promise<ApodPost | null> {
  const posts = await fetchApodPosts();
  return posts.length > 0 ? posts[posts.length - 1] : null;
}
