const fs = require('fs');
const path = require('path');
const CONFIG_PATH = process.env.WELCOME_CONFIG_PATH || path.join(__dirname, '..', 'config.json');
const DEFAULTS = {
  welcomeChannelId: '',
  message: 'Welcome {user_mention}!\n\nWelcome to **{server_name}**. You are member #{member_count}. Check out the channels and follow the rules.\n\nEnjoy your stay! 🎉',
  serverName: '',
  ai: { enabled: true, dailyLimit: 0, scene: 'ai/scene.jpg', crop: { x: 684, y: 0, w: 512, h: 512 }, box: { x: 815, y: 85, w: 250, h: 265 }, timeoutMs: 25000 },
  image: {
    enabled: true, background: 'assets/template.png', fallbackBackground: 'assets/background.png',
    template: {"avatar": {"x": 836, "y": 246, "r": 138, "placeholderColor": "#5865F2"}, "name": {"x": 836, "y": 592, "maxWidth": 780, "fontSize": 92, "minFontSize": 44, "color": "#FBC848", "font": "WelcomeSerif, serif", "fontWeight": "bold"}, "count": {"x": 858, "y": 816, "fontSize": 36, "color": "#F6F5FA", "font": "WelcomeMono, monospace", "maxWidth": 160}}, showAvatar: true, showName: true,
    title: 'WELCOME', subtitle: 'to {server_name}',
    colors: { title: '#FFFFFF', name: '#FFD166', subtitle: '#D0D4E8', avatarRing: '#FFD166' },
    font: 'sans-serif'
  }
};
function merge(d, o) {
  const out = { ...d };
  for (const k of Object.keys(o || {})) out[k] = (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) ? merge(d[k], o[k]) : o[k];
  return out;
}
function loadConfig(p = CONFIG_PATH) {
  try { return merge(DEFAULTS, JSON.parse(fs.readFileSync(p, 'utf8'))); }
  catch (e) { console.warn(`[config] Could not read ${p} (${e.message}); using defaults.`); return merge(DEFAULTS, {}); }
}
function saveConfig(cfg, p = CONFIG_PATH) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
  fs.renameSync(tmp, p);
}
module.exports = { loadConfig, saveConfig, CONFIG_PATH, DEFAULTS };
