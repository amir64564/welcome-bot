const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
try {
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'SourceSerifPro-Black.ttf'), 'WelcomeSerif');
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'SpaceMono-Regular.ttf'), 'WelcomeMono');
} catch (e) { console.warn(`[image] font registration failed (${e.message}); using system fonts`); }
const W = 1024, H = 450, AV = 180;

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
async function fetchBuffer(url, timeoutMs = 8000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(timer); }
}
async function loadAvatar(urls, fetcher) {
  for (const u of urls.filter(Boolean)) {
    try { return await loadImage(await fetcher(u)); }
    catch (e) { console.warn(`[image] avatar fetch failed (${e.message}), trying fallback`); }
  }
  return null; // placeholder circle
}
/**
 * opts: { displayName, serverName, avatarUrls: [primary, fallback], config: cfg.image, baseDir, fetcher }
 * returns PNG Buffer
 */
async function renderTemplate(opts, bgPath, fetcher) {
  const t = opts.config.template;
  const bg = await loadImage(bgPath);
  const w = bg.width, h = bg.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bg, 0, 0, w, h);
  const a = t.avatar;
  if (opts.config.showAvatar !== false && a) {
    const av = await loadAvatar(opts.avatarUrls || [], fetcher);
    ctx.save(); ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    if (av) ctx.drawImage(av, a.x - a.r, a.y - a.r, a.r * 2, a.r * 2);
    else { ctx.fillStyle = a.placeholderColor || '#5865F2'; ctx.fillRect(a.x - a.r, a.y - a.r, a.r * 2, a.r * 2); }
    ctx.restore();
  }
  const n = t.name;
  if (opts.config.showName !== false && n && opts.displayName) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = n.color || '#FBC848';
    let size = n.fontSize || 88; const min = n.minFontSize || 44;
    const setF = () => { ctx.font = `${n.fontWeight || 'bold'} ${size}px ${n.font || 'WelcomeSerif, serif'}`; };
    setF();
    while (size > min && ctx.measureText(opts.displayName).width > n.maxWidth) { size -= 2; setF(); }
    if (n.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; }
    ctx.fillText(truncate(ctx, opts.displayName, n.maxWidth), n.x, n.y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  const c = t.count;
  if (c && opts.memberCount != null) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = c.color || '#F6F5FA';
    ctx.font = `${c.fontSize || 36}px ${c.font || 'WelcomeMono, monospace'}`;
    ctx.fillText(truncate(ctx, String(opts.memberCount), c.maxWidth || 160), c.x, c.y);
  }
  return canvas.toBuffer('image/png');
}

async function renderWelcome(opts) {
  let img = opts.config;
  const fetcherT = opts.fetcher || fetchBuffer;
  if (img.template && img.background) {
    const tp = path.resolve(opts.baseDir || path.join(__dirname, '..'), img.background);
    if (fs.existsSync(tp)) return renderTemplate(opts, tp, fetcherT);
    console.warn(`[image] template ${img.background} missing; using fallback layout`);
    img = { ...img, background: img.fallbackBackground };
  }
  const c = img.colors || {};
  const font = img.font || 'sans-serif';
  const fetcher = opts.fetcher || fetchBuffer;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bgPath = path.resolve(opts.baseDir || path.join(__dirname, '..'), img.background || '');
  if (img.background && fs.existsSync(bgPath)) {
    ctx.drawImage(await loadImage(bgPath), 0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#4c1d95');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  let y = 60;
  if (img.showAvatar) {
    const cx = W / 2, cy = 40 + AV / 2;
    ctx.beginPath(); ctx.arc(cx, cy, AV / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = c.avatarRing || '#FFD166'; ctx.fill();
    const av = await loadAvatar(opts.avatarUrls || [], fetcher);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, AV / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    if (av) ctx.drawImage(av, cx - AV / 2, cy - AV / 2, AV, AV);
    else { ctx.fillStyle = '#5865F2'; ctx.fillRect(cx - AV / 2, cy - AV / 2, AV, AV); }
    ctx.restore();
    y = 40 + AV + 25;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = c.title || '#fff'; ctx.font = `bold 56px ${font}`;
  ctx.fillText(truncate(ctx, img.title || '', W - 80), W / 2, y); y += 66;
  if (img.showName && opts.displayName) {
    ctx.fillStyle = c.name || '#FFD166'; ctx.font = `bold 40px ${font}`;
    ctx.fillText(truncate(ctx, opts.displayName, W - 120), W / 2, y); y += 50;
  }
  if (img.subtitle) {
    ctx.fillStyle = c.subtitle || '#ddd'; ctx.font = `28px ${font}`;
    ctx.fillText(truncate(ctx, img.subtitle, W - 120), W / 2, y);
  }
  return canvas.toBuffer('image/png');
}
module.exports = { renderWelcome, truncate, W, H };
