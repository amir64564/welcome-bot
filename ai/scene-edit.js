// AI scene edit: replaces ONLY the seesaw character in ai/scene.jpg with a chibi 3D clay-toy
// version of the member's avatar. Monsters/background stay untouched (edited crop is blended back).
// Returns a PNG Buffer, or null on ANY problem (no key, error, quota, flagged, timeout) -> caller uses template.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULTS = {
  scene: 'ai/scene.jpg',
  crop: { x: 684, y: 0, w: 512, h: 512 },   // square area sent to Cloudflare (must contain the character)
  box: { x: 815, y: 85, w: 250, h: 265 },   // character area taken from a full-scene edit (OpenRouter)
  timeoutMs: 25000,
};
const PROMPT = 'Edit image 1 (a cute 3D clay/vinyl-toy style scene). Replace ONLY the character sitting on the right end of the seesaw with a new cute chibi 3D clay-toy character that clearly resembles the person/character in image 2 (hair style and color, skin tone, face, accessories, outfit colors). Same pose, size and position, same clay render style and lighting. Completely remove the original character. Keep everything else identical: red, blue and yellow monsters, seesaw, flowers, grass, clouds, sky. Output the full scene at the same framing.';

function provider() {
  const p = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (p) return p;
  return process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN ? 'cloudflare' : 'off';
}

async function fetchT(url, opts, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}
async function sq512(buf, sx = 0, sy = 0, sw, sh) {
  const im = await loadImage(buf); const c = createCanvas(512, 512);
  c.getContext('2d').drawImage(im, sx, sy, sw || im.width, sh || im.height, 0, 0, 512, 512); return c.toBuffer('image/png');
}

// ---- Cloudflare Workers AI (CF_ACCOUNT_ID, CF_API_TOKEN, CF_IMAGE_MODEL, CF_STEPS) ----
async function cloudflare(sceneBuf, avBuf, o) {
  const { CF_ACCOUNT_ID: acc, CF_API_TOKEN: tok } = process.env; if (!acc || !tok) return null;
  const crop = await sq512(sceneBuf, o.crop.x, o.crop.y, o.crop.w, o.crop.h); const av = await sq512(avBuf);
  const model = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-2-dev';
  const f = new FormData();
  f.append('prompt', 'Image 0 is a cute 3D clay/vinyl-toy style scene. Make the character from image 1 sit on the seesaw in image 0 instead of the current character, as a cute chibi 3D clay toy figure. Same pose, size and position, same clay render style and lighting. Keep the seesaw, monsters, flowers, grass and sky exactly the same.');
  f.append('input_image_0', new Blob([crop], { type: 'image/png' }), 'scene.png');
  f.append('input_image_1', new Blob([av], { type: 'image/png' }), 'avatar.png');
  f.append('width', '512'); f.append('height', '512'); f.append('steps', process.env.CF_STEPS || '16');
  const r = await fetchT(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`,
    { method: 'POST', body: f, headers: { Authorization: `Bearer ${tok}` } }, o.timeoutMs);
  if (!r.ok) { console.warn('[ai] cloudflare', r.status, (await r.text()).slice(0, 200)); return null; } // 429/quota/flagged
  const b64 = (await r.json())?.result?.image; if (!b64) return null;
  return composite(sceneBuf, { crop: Buffer.from(b64, 'base64') }, o);
}

// ---- OpenRouter (OPENROUTER_API_KEY, OPENROUTER_MODEL) ----
async function openrouter(sceneBuf, avBuf, o) {
  const key = process.env.OPENROUTER_API_KEY; if (!key) return null;
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-image';
  const url = (b, m) => `data:${m};base64,${b.toString('base64')}`;
  const r = await fetchT('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, modalities: ['image', 'text'], messages: [{ role: 'user', content: [
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: url(sceneBuf, 'image/jpeg') } },
      { type: 'image_url', image_url: { url: url(avBuf, 'image/png') } }] }] }),
  }, o.timeoutMs);
  if (!r.ok) { console.warn('[ai] openrouter', r.status, (await r.text()).slice(0, 200)); return null; }
  const u = (await r.json())?.choices?.[0]?.message?.images?.[0]?.image_url?.url; if (!u) return null;
  const buf = u.startsWith('data:') ? Buffer.from(u.split(',')[1], 'base64') : Buffer.from(await (await fetchT(u, {}, o.timeoutMs)).arrayBuffer());
  return composite(sceneBuf, { full: buf }, o);
}

// Paste only the character region back onto the original scene (feathered edges, no seams).
async function composite(sceneBuf, out, o) {
  const scene = await loadImage(sceneBuf); const W = scene.width, H = scene.height;
  const c = createCanvas(W, H); const x = c.getContext('2d'); x.drawImage(scene, 0, 0);
  if (out.crop) {
    const { crop: C } = o; const ed = await loadImage(out.crop); const F = 60;
    const m = createCanvas(C.w, C.h); const mx = m.getContext('2d'); mx.drawImage(ed, 0, 0, C.w, C.h);
    mx.globalCompositeOperation = 'destination-in';
    const gl = mx.createLinearGradient(0, 0, F, 0); gl.addColorStop(0, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,1)');
    mx.fillStyle = gl; mx.fillRect(0, 0, C.w, C.h);
    const gb = mx.createLinearGradient(0, C.h - F, 0, C.h); gb.addColorStop(0, 'rgba(0,0,0,1)'); gb.addColorStop(1, 'rgba(0,0,0,0)');
    mx.fillStyle = gb; mx.fillRect(0, 0, C.w, C.h);
    x.drawImage(m, C.x, C.y);
  } else {
    const { box: B } = o; const ed = await loadImage(out.full); const sx = ed.width / W, sy = ed.height / H;
    const m = createCanvas(B.w, B.h); const mx = m.getContext('2d');
    mx.drawImage(ed, B.x * sx, B.y * sy, B.w * sx, B.h * sy, 0, 0, B.w, B.h);
    mx.globalCompositeOperation = 'destination-in';
    const g = mx.createRadialGradient(B.w / 2, B.h / 2, B.w * 0.35, B.w / 2, B.h / 2, B.w * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); mx.fillStyle = g; mx.fillRect(0, 0, B.w, B.h);
    x.drawImage(m, B.x, B.y);
  }
  return c.toBuffer('image/png');
}

const PROVIDERS = { cloudflare, openrouter };
async function sceneEdit(avatarBuf, cfg = {}) {
  const o = { ...DEFAULTS, ...cfg, crop: { ...DEFAULTS.crop, ...cfg.crop }, box: { ...DEFAULTS.box, ...cfg.box } };
  const fn = PROVIDERS[provider()]; if (!fn || !avatarBuf) return null;
  let timer;
  try {
    const sceneBuf = fs.readFileSync(path.resolve(ROOT, o.scene));
    return await Promise.race([fn(sceneBuf, avatarBuf, o).catch(e => { console.warn('[ai]', e.message); return null; }),
      new Promise(r => { timer = setTimeout(() => r(null), o.timeoutMs); })]);
  } catch (e) { console.warn('[ai]', e.message); return null; } finally { clearTimeout(timer); }
}
module.exports = { sceneEdit, provider };

// CLI test: node ai/scene-edit.js <avatar file or url> [out.png]
if (require.main === module) (async () => {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const src = process.argv[2] || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const av = fs.existsSync(src) ? fs.readFileSync(src) : Buffer.from(await (await fetch(src)).arrayBuffer());
  const t = Date.now(); const out = await sceneEdit(av);
  if (!out) return console.log(`provider=${provider()} -> null (template fallback) in ${Date.now() - t} ms`);
  const f = path.resolve(process.argv[3] || 'ai/test-out.png'); fs.writeFileSync(f, out);
  console.log(`provider=${provider()} saved ${f} in ${Date.now() - t} ms`);
})();
