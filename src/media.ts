import { InputFile } from "grammy";

export async function fetchMediaAsInputFile(url: string, filename = "image.jpg"): Promise<InputFile | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      console.warn(`[WARN] Failed to fetch media from ${url}: HTTP ${res.status}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return new InputFile(Buffer.from(arrayBuffer), filename);
  } catch (err) {
    console.warn(`[WARN] Error downloading media from ${url}:`, err);
    return null;
  }
}
