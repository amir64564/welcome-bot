# Welcome Bot

When someone joins your server, the bot posts a welcome message with an image in your welcome channel.

**Image order:**
1. **AI art** – the character on the seesaw in `ai/scene.jpg` is replaced by a cute chibi clay-toy version of the new member's profile picture. Monsters and background stay the same. (See `ai/example-output.png`.)
2. **Template** – if AI is off, fails, takes longer than 25s, or the daily limit/free quota is used up, the purple template (`assets/template.png`) is used automatically.
3. **Text only** – if both images fail, the text welcome is still sent.

## Quick start (Hinglish)

```bash
git clone https://github.com/amir64564/welcome-bot.git
cd welcome-bot
npm install
cp .env.example .env      # ab .env kholo aur values bharo
npm start
```

1. `.env` mein `DISCORD_TOKEN` aur `CLIENT_ID` daalo (Developer Portal se).
2. AI art chahiye to Cloudflare (`CF_ACCOUNT_ID`, `CF_API_TOKEN`) ya OpenRouter (`AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`) daalo. Kuch nahi daala to sirf template chalega.
3. Developer Portal > Bot > Privileged Gateway Intents mein **Server Members Intent** ON karo (warna join event nahi aayega).
4. Bot ko server mein add karo is link se (CLIENT_ID apna daalo):
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=51200&scope=bot%20applications.commands`
5. Server mein `/welcome-config set-channel` se welcome channel chuno, phir `/welcome-config preview` se test karo.

Node.js 18+ chahiye. Ek hi jagah bot chalao, warna har join pe do welcome aayenge.

## Commands (`/welcome-config`, Manage Server needed)

| Command | What it does |
|---|---|
| `set-channel` | Choose the welcome channel |
| `set-message` | Change the welcome text. Placeholders: `{user_mention}` `{username}` `{display_name}` `{server_name}` `{member_count}`. Use `\n` for a new line |
| `image enabled:` | Turn the welcome image on/off |
| `ai enabled: [daily-limit:]` | Turn AI art on/off; optional max AI images per day (0 = unlimited) |
| `preview` | Shows the welcome only to you, using the same AI → template flow |
| `show` | Shows current settings |

Example message: `Hey {user_mention} Welcome to {server_name}!\nEnjoy your stay 🎉`

## AI providers (`.env`)

- `AI_PROVIDER=cloudflare` – Cloudflare Workers AI. Free ~7-8 images/day (resets 5:30 AM IST), then about ₹1/image with billing. Model `CF_IMAGE_MODEL`, quality `CF_STEPS`.
- `AI_PROVIDER=openrouter` – needs credits. `OPENROUTER_MODEL=google/gemini-2.5-flash-image` (best) or `openai/gpt-5-image-mini` (cheaper).
- `AI_PROVIDER=off` – always use the template.

Test AI alone: `node ai/scene-edit.js path/to/avatar.png out.png`

## Customising

- **Scene image:** replace `ai/scene.jpg`. Then set in `config.json` → `ai`:
  - `crop` – a square area (x, y, w, h in pixels) that contains the seesaw character; this part is sent to Cloudflare and blended back.
  - `box` – the tight box around the character (used with OpenRouter full-scene edits).
- **Template:** replace `assets/template.png`; avatar/name/member-number positions, colours and font sizes are in `config.json` → `image.template`. The line under your name is drawn from `image.subtitle` (default `Welcome to {server_name}`); its position/font/colour are in `image.template.subtitle`.
- **Message:** `/welcome-config set-message` (or `message` in `config.json`).

## Dev

`npm test` (offline, AI is mocked) and `npm run check`.
