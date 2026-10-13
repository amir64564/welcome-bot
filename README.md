# Welcome Bot (welcome-only)

Does exactly one thing: when a member **joins**, it posts your configured welcome note in your welcome channel, mentions them, and attaches a template-rendered welcome image (optional). No moderation, XP, giveaways, roles, tickets or background tasks. Nothing is sent on startup or to existing members.

## 1. Discord Developer Portal
1. https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → *Reset Token* → copy token (keep it secret).
3. Bot tab → **Privileged Gateway Intents** → enable **Server Members Intent** → Save.
4. Copy **Application ID** (General Information) for the invite URL.

## 2. Install
```bash
npm install
cp .env.example .env     # put DISCORD_TOKEN=... (CLIENT_ID optional)
```

## 3. config.json
| Field | Meaning |
|---|---|
| `welcomeChannelId` | ID of welcome channel (Developer Mode → right-click channel → Copy ID) |
| `message` | Welcome text. Discord markdown, emojis, `\n` newlines. Placeholders: `{user_mention}` `{username}` `{display_name}` `{server_name}` `{member_count}` |
| `serverName` | Branding name; empty = actual server name |
| `image.enabled` | `true`/`false` |
| `image.background` | Template PNG; canvas uses its native size. Default `assets/template.png` (Exquisite Agents design, 1672×941, placeholders removed) |
| `image.fallbackBackground` | Used with the old 1024×450 layout if the template file is missing. `assets/background.png` (`npm run make-background`) |
| `image.template.avatar` | `{x, y, r}` avatar circle in template pixels (default 836, 246, 138) |
| `image.template.name` | `{x, y, maxWidth, fontSize, minFontSize, color, font}` name centered here, auto-shrinks then truncates |
| `image.template.count` | `{x, y, fontSize, color, font}` member number drawn left-aligned after "MEMBER #" (baseline y) |
| Remove `image.template` | to use the old generated layout instead |
| `image.showAvatar` / `image.showName` | Show avatar circle / display name |
| `image.title` / `image.subtitle` | Text on image (placeholders allowed) |
| `image.colors` | `title`, `name`, `subtitle`, `avatarRing` hex colors |
| `image.font` | CSS font family (must be installed on the host) |

Config is re-read on every join, so edits apply without restart.
Admins (Manage Server/Administrator) can also use `/welcome-config set-channel | set-message | image | preview | show`. Preview/show are ephemeral (only the admin sees them).

## 4. Invite URL
Permissions: View Channels (1024) + Send Messages (2048) + Embed Links (16384) + Attach Files (32768) = **51200**.
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=51200&scope=bot%20applications.commands
```

## 5. Run
```bash
npm start      # run bot
npm test       # offline tests with mocks
node scripts/samples.js   # writes sample-welcome.png and sample-welcome-long.png
npm run check  # node --check all files
```

## 6. Deploy on your VPS (always-on)
**pm2**
```bash
npm i -g pm2
pm2 start src/index.js --name welcome-bot
pm2 save && pm2 startup
pm2 logs welcome-bot
```
**systemd** (`/etc/systemd/system/welcome-bot.service`)
```ini
[Unit]
Description=Discord Welcome Bot
After=network-online.target
[Service]
WorkingDirectory=/opt/welcome-bot
ExecStart=/usr/bin/node src/index.js
Restart=always
User=welcomebot
[Install]
WantedBy=multi-user.target
```
`sudo systemctl daemon-reload && sudo systemctl enable --now welcome-bot`, logs: `journalctl -u welcome-bot -f`.
Requires Node 18+. @napi-rs/canvas ships prebuilt binaries (no system libs needed).

## 7. Maintenance
- Update deps: `npm update`, then `npm test`.
- Token leaked? Reset in Developer Portal, update `.env`, restart.
- Warnings like `Missing permissions in #channel` → fix channel permissions for the bot role.

## 8. Live test checklist
- [ ] Bot online, `/welcome-config set-channel` done, `/welcome-config preview` looks right.
- [ ] Join with an alt account → message appears in welcome channel.
- [ ] Alt is mentioned correctly (blue mention, pinged); nobody else pinged.
- [ ] Note text matches config; image shows alt's avatar + name.
- [ ] Set `image.background` to a bad path / remove AttachFiles → text still sends.
- [ ] Restart bot → no messages to existing members.
- [ ] Leave & rejoin quickly (<60s) → only one welcome.
