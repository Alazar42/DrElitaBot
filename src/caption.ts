import { ApodPost } from "./types";

export const TELEGRAM_CAPTION_LIMIT = 1024;

/**
 * Truncates an HTML string so that it fits within maxLen (default 1024 for Telegram photo captions),
 * while preserving valid HTML tag structure, properly closing all open tags, and appending footer links.
 */
export function formatSinglePostCaption(post: ApodPost, maxLen: number = TELEGRAM_CAPTION_LIMIT): string {
  const fullHtml = post.cleanHtml.trim();
  if (fullHtml.length <= maxLen) {
    return fullHtml;
  }

  // Build footer (Discuss & HD links or fallback to NASA APOD link)
  const footerLinks: string[] = [];
  if (post.discussUrl) {
    footerLinks.push(`<b>🔗</b><a href="${post.discussUrl}"><b><i>Discuss</i></b></a>`);
  }
  if (post.hdUrl) {
    footerLinks.push(`🎞<a href="${post.hdUrl}"><b><i>HD</i></b></a>`);
  }
  const footer = footerLinks.length > 0 ? footerLinks.join(" ") : `<a href="${post.nasaUrl}">APOD Page</a>`;
  const footerBlock = `\n\n${footer}`;

  // Find where the footer starts in cleanHtml if present to avoid duplicating it
  let bodyHtml = fullHtml;
  const footerIdx = fullHtml.lastIndexOf("<b>🔗</b>");
  if (footerIdx !== -1) {
    bodyHtml = fullHtml.slice(0, footerIdx).trim();
  }

  const budget = maxLen - footerBlock.length - 4; // safety margin for '...'

  let result = "";
  const tagStack: string[] = [];
  const tokenRegex = /(<(?:\/)?([a-zA-Z0-9]+)(?:\s+[^>]*)?>)|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(bodyHtml)) !== null) {
    const isTag = Boolean(match[1]);
    const tagName = match[2] ? match[2].toLowerCase() : "";
    const isClosing = isTag && match[0].startsWith("</");
    const textToken = match[3] || "";

    const closingTagsLen = tagStack.reduce((acc, tag) => acc + tag.length + 3, 0); // </tag> is tag.length + 3

    if (isTag) {
      if (isClosing) {
        const lastIdx = tagStack.lastIndexOf(tagName);
        if (lastIdx !== -1) {
          tagStack.splice(lastIdx, 1);
        }
      } else {
        tagStack.push(tagName);
      }
      result += match[0];
    } else {
      if (result.length + textToken.length + closingTagsLen > budget) {
        const available = budget - result.length - closingTagsLen;
        if (available > 10) {
          const slice = textToken.slice(0, available);
          // Try to cut at sentence end
          const lastPeriod = slice.lastIndexOf(". ");
          if (lastPeriod > available * 0.6) {
            result += slice.slice(0, lastPeriod + 1);
          } else {
            const lastSpace = slice.lastIndexOf(" ");
            result += (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + "...";
          }
        } else {
          result += "...";
        }
        break;
      } else {
        result += textToken;
      }
    }
  }

  // Close all remaining open tags in reverse order
  while (tagStack.length > 0) {
    const tag = tagStack.pop();
    result += `</${tag}>`;
  }

  const finalCaption = `${result.trim()}${footerBlock}`.trim();
  return finalCaption.length <= maxLen ? finalCaption : finalCaption.slice(0, maxLen);
}
