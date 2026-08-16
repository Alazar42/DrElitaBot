# DrElitaBot - NASA APOD Telegram Forwarder

An automated Telegram bot written in TypeScript that monitors the official [NASA Astronomy Picture of the Day (@apod_telegram)](https://t.me/apod_telegram) channel and automatically forwards daily APOD posts with high-resolution imagery and formatted explanations directly to your Telegram channel.

Supports both **Vercel Serverless (100% Free Tier)** and traditional **Node.js 24/7 background worker** deployments.

---

## Features

- **100% Free Serverless on Vercel**: Fully adapted for Vercel Serverless Functions and Vercel Cron Jobs.
- **Automated Periodic Monitoring**: Uses Vercel Cron (or background `node-cron`) to check and forward new daily APOD posts automatically.
- **Single Unified Photo + Caption Message**: Delivers posts with the image and complete formatted explanation (including clickable links and credits) attached directly as a single Telegram message.
- **Direct Media Buffer Upload**: Downloads media in-memory and uploads raw image bytes (`InputFile`) to Telegram to avoid third-party CDN rate-limiting or broken preview errors.
- **State Deduplication**: Automatically tracks published post IDs and dates to prevent duplicates.
- **Access-Controlled Commands**: Whitelisted commands (`/help`, `/latest`, `/post_today`) restricted to authorized Telegram user IDs.
- **1-Click Webhook Registration**: Easy `/api/set-webhook` endpoint to connect Telegram to your Vercel deployment instantly.

---

## Commands

Authorized users (configured via `ALLOWED_USERS`) can interact with the bot using the following commands:

| Command | Description |
| :--- | :--- |
| `/help` or `/start` | Displays bot description and list of available commands |
| `/latest` | Previews the latest APOD post in private chat with the image and formatted explanation |
| `/post_today` | Manually checks and publishes today's APOD to the target channel (skips if already posted) |

> **Note:** Any user not listed in `ALLOWED_USERS` will be denied access when sending commands.

---

## Deploy to Vercel (100% Free)

You can host DrElitaBot on Vercel's Free Hobby Tier without any paid servers.

### 1. Import Repository into Vercel
1. Go to [vercel.com](https://vercel.com) and log in with GitHub.
2. Click **Add New...** > **Project**.
3. Select your **`Alazar42/DrElitaBot`** repository.

### 2. Configure Environment Variables
Under **Environment Variables** in the Vercel project settings, add:

| Key | Value Example | Description |
| :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Your Telegram Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHANNEL_ID` | Target Channel ID or `@channel_username` (bot must be admin) |
| `ALLOWED_USERS` | Comma-separated Telegram User IDs permitted to use commands |

*(Optional)* If you want persistent deduplication across serverless cold boots:
- Add a free **Upstash Redis** database from the Vercel Marketplace (Integration tab) or [upstash.com](https://upstash.com), which automatically sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

### 3. Deploy & Connect Webhook
1. Click **Deploy**.
2. Once the deployment finishes, copy your Vercel URL (e.g. `https://dr-elita-bot.vercel.app`).
3. Open this URL in your browser to register the Telegram webhook:
   ```text
   https://dr-elita-bot.vercel.app/api/set-webhook
   ```
4. You will receive a success response:
   ```json
   {
     "success": true,
     "message": "Webhook successfully registered to: https://dr-elita-bot.vercel.app/api/webhook"
   }
   ```

**That's it!** 
- Vercel Cron will automatically trigger `/api/cron` hourly.
- Your bot will respond to `/help`, `/latest`, and `/post_today` in real time via `/api/webhook`.

---

## Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Alazar42/DrElitaBot.git
   cd DrElitaBot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Fill in your `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, and `ALLOWED_USERS`.

4. **Run locally:**
   ```bash
   npm run dev
   ```

---

## Project Structure

```text
DrElitaBot/
├── api/
│   ├── cron.ts             # Vercel Cron scheduled endpoint (/api/cron)
│   ├── set-webhook.ts      # 1-click Telegram webhook registration (/api/set-webhook)
│   └── webhook.ts          # Telegram webhook update receiver (/api/webhook)
├── data/
│   └── .gitkeep            # Directory for local runtime state
├── src/
│   ├── bot.ts              # Bot instance, whitelist middleware & commands
│   ├── config.ts           # Environment variables configuration
│   ├── index.ts            # Local standalone daemon entry point
│   ├── media.ts            # Media buffer downloader & InputFile generator
│   ├── poster.ts           # Channel publisher (single-message photo + caption)
│   ├── scheduler.ts        # node-cron scheduler for standalone mode
│   ├── scraper.ts          # APOD Telegram channel parser
│   ├── state.ts            # State deduplication (local JSON + Upstash KV support)
│   └── types.ts            # TypeScript interfaces
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
├── LICENSE                 # MIT License
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── vercel.json             # Vercel Cron definitions
└── README.md               # Project documentation
```

---

## License

This project is licensed under the [MIT License](LICENSE).
