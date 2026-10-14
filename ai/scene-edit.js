// AI scene edit: replaces ONLY the seesaw character in ai/scene.jpg with a chibi 3D clay-toy
// version of the member's avatar. Monsters/background stay untouched (edited crop is blended back).
// Returns a PNG Buffer, or null on ANY problem (no key, error, quota, flagged, timeout) -> caller uses template.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULTS = {
  scene: 'ai/scene.jpg',
  mask: 'ai/mask.png',      // white = character area to replace (512x512, same as crop), soft edges
  crop: { x: 684, y: 0, w: 512, h: 512 },   // square area sent to Cloudflare (must contain the character)
  box: { x: 815, y: 85, w: 250, h: 265 },   // character area taken from a full-scene edit (OpenRouter)
  timeoutMs: 35000,
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
const CF_PROMPT = 'Image 0 is a cute 3D clay/vinyl-toy style scene. Replace the character sitting on the seesaw with a cute chibi 3D clay toy figure based on image 1. If image 1 is a real photo of a person, turn that person into a stylised chibi clay toy (big head, small body, simple cute face) keeping their hair style and hair color, skin tone, glasses and clothing colors. Same sitting pose holding the handle, same size and position, same soft clay render style and lighting. Keep the seesaw, monsters, flowers, grass and sky exactly the same.';
async function cfRun(model, body, o) {
  const { CF_ACCOUNT_ID: acc, CF_API_TOKEN: tok } = process.env;
  const r = await fetchT(`https://api.cloudflare.com/client/v4/accounts/${acc}/ai/run/${model}`,
    { method: 'POST', body, headers: { Authorization: `Bearer ${tok}`, ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}) } }, o.timeoutMs);
  if (!r.ok) { const t = (await r.text()).slice(0, 200); console.warn('[ai] cloudflare', r.status, t); return { err: /flagged|3030/.test(t) ? 'flagged' : (r.status === 429 || /neuron|quota|limit/i.test(t)) ? 'quota' : 'error' }; }
  return { json: await r.json() };
}
const COLORS = ['black','white','grey','gray','silver','red','pink','orange','yellow','blonde','gold','golden','brown','beige','tan','green','teal','turquoise','blue','navy','purple','violet','lavender'];
const HUMAN = ['man','woman','boy','girl','person','guy','lady','child','kid','human','people','men','women'];
const KINDS = ['horse','pony','unicorn','cat','kitten','dog','puppy','squid','octopus','fish','bird','duck','bear','fox','wolf','rabbit','bunny','monkey','frog','dragon','robot','skull','car','logo','tiger','lion','panda','penguin','shark','alien','monster','pig','cow','sheep','goat','deer','owl'];
const SYN = { gray: 'grey', silver: 'grey', blonde: 'yellow', gold: 'yellow', golden: 'yellow', tan: 'brown', beige: 'brown', navy: 'blue', teal: 'blue', turquoise: 'blue', violet: 'purple', lavender: 'purple', pony: 'horse', unicorn: 'horse', kitten: 'cat', puppy: 'dog', bunny: 'rabbit', octopus: 'squid', men: 'man', women: 'woman' };
function attrs(text) {
  const w = String(text).toLowerCase().match(/[a-z]+/g) || []; const n = x => SYN[x] || x;
  return { colors: new Set(w.filter(x => COLORS.includes(x)).map(n)), human: w.some(x => HUMAN.includes(x)),
    kinds: new Set(w.filter(x => KINDS.includes(x)).map(n)), glasses: w.some(x => /^(glasses|spectacles|sunglasses|goggles)$/.test(x)) };
}
// Compare avatar caption with a caption of the generated character. Returns { ok, why }.
function matchVerdict(avDesc, charDesc) {
  if (!avDesc) return { ok: true, why: 'no avatar caption (skipped)' };
  if (!charDesc) return { ok: true, why: 'no character caption (skipped)' };
  const a = attrs(avDesc), c = attrs(charDesc); const why = [];
  if (a.kinds.size && ![...a.kinds].some(k => c.kinds.has(k))) why.push(`type ${[...a.kinds]} missing`);
  if (!a.kinds.size && a.human && c.kinds.size && !c.human) why.push(`expected person, got ${[...c.kinds]}`);
  if (a.colors.size && ![...a.colors].some(k => c.colors.has(k))) why.push(`no shared colour (${[...a.colors]} vs ${[...c.colors]})`);
  if (a.glasses && !c.glasses) why.push('glasses missing');
  return { ok: why.length === 0, why: why.join('; ') || 'attributes match' };
}
async function caption(av, prompt = 'Describe this avatar in one short line: what it is (person, or which animal/object), hair or fur color, skin tone, glasses, outfit colors, accessories. No names, no intro.') {
  const { json } = await cfRun('@cf/llava-hf/llava-1.5-7b-hf', JSON.stringify({ image: [...av], max_tokens: 60, prompt }), { timeoutMs: 7000 }).catch(() => ({}));
  return (json?.result?.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}
async function cloudflare(sceneBuf, avBuf, o) {
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) return null;
  const crop = await sq512(sceneBuf, o.crop.x, o.crop.y, o.crop.w, o.crop.h); const av = await sq512(avBuf);
  const blank = await blankOut(crop, o); // old character removed so the model cannot just repaint her
  const desc = await caption(av); console.log(`[ai] avatar caption: ${desc || '(none)'}`);
  const model = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-2-dev';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const f = new FormData();
    const who = desc ? ` The subject is: ${desc}.` : '';
    let prompt = `Image 0 is a cute 3D clay/vinyl-toy style scene with an empty blurry spot on the right end of the seesaw. Put a new cute chibi 3D clay toy figure of the subject from image 1 sitting there holding the handle.${who} Whatever image 1 is (a real photo of a person, an animal, an anime or cartoon character, a logo or object), turn THAT subject into a stylised chibi clay toy (big head, small body, cute face), keeping its main colors, hair or fur, glasses, clothes and accessories. Do not invent a different character. Same clay render style and lighting as image 0. Keep the seesaw, monsters, flowers, grass and sky exactly the same.`;
    f.append('input_image_0', new Blob([blank], { type: 'image/png' }), 'scene.png');
    if (attempt === 1) f.append('input_image_1', new Blob([av], { type: 'image/png' }), 'avatar.png');
    else prompt = `Image 0 is a cute 3D clay/vinyl-toy style scene with an empty blurry spot on the right end of the seesaw. Put a new cute chibi 3D clay toy figure sitting there holding the handle.${who || ' A cute friendly character.'} Same clay style and lighting. Keep everything else exactly the same.`;
    f.append('prompt', prompt); f.append('seed', String(Math.floor(Math.random() * 1e9)));
    f.append('width', '512'); f.append('height', '512'); f.append('steps', process.env.CF_STEPS || '16');
    const { json, err } = await cfRun(model, f, o);
    if (err === 'quota') return null;
    const b64 = json?.result?.image;
    if (!b64) { console.warn(`[ai] attempt ${attempt}: ${err || 'no image'}`); continue; }
    const raw = Buffer.from(b64, 'base64'); save(`raw-${attempt}.png`, raw);
    const chk = await sanity(crop, raw, o); // vs ORIGINAL crop: outside must match, inside must differ from old girl
    console.log(`[ai] attempt ${attempt}: outside-diff ${chk.outside.toFixed(1)} inside-diff ${chk.inside.toFixed(1)} -> ${chk.ok ? 'ok' : 'rejected'}`);
    if (!chk.ok) continue;
    const cc = await charCrop(raw, o); const cdesc = await caption(cc, 'Describe the character in the middle in one short line: what it is (person or animal type), hair or fur color, outfit colors, glasses, accessories. No intro.');
    const v = matchVerdict(desc, cdesc);
    console.log(`[ai] attempt ${attempt}: match check -> ${v.ok ? 'MATCH' : 'NO MATCH'} (${v.why}) | character: ${cdesc || '(none)'}`);
    if (v.ok) return composite(sceneBuf, { crop: raw }, o);
  }
  return null;
}

// Crop the character area (mask bounding box) from a 512 edit, for the match check.
async function charCrop(buf, o) {
  const { data: m } = await maskData(o); let x0 = 512, y0 = 512, x1 = 0, y1 = 0;
  for (let i = 0; i < m.length; i += 4) if (m[i] > 128) { const p = i / 4, x = p % 512, y = (p / 512) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const im = await loadImage(buf); const c = createCanvas(x1 - x0, y1 - y0);
  c.getContext('2d').drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0); return c.toBuffer('image/png');
}

// Replace the masked character area with a heavy blur of the surroundings (removes the old girl).
async function blankOut(cropBuf, o) {
  const im = await loadImage(cropBuf); const { canvas: mk } = await maskData(o);
  const b = createCanvas(512, 512); const bx = b.getContext('2d'); bx.filter = 'blur(40px)'; bx.drawImage(im, 0, 0); bx.filter = 'none';
  const md = mk.getContext('2d').getImageData(0, 0, 512, 512).data; const bd = bx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < md.length; i += 4) bd.data[i + 3] = md[i]; bx.putImageData(bd, 0, 0);
  const c = createCanvas(512, 512); const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.drawImage(b, 0, 0);
  const out = c.toBuffer('image/png'); save('input.png', out); return out;
}

// Last few AI outputs for debugging (ai/last/, gitignored)
const LAST = path.join(__dirname, 'last'); let seq = 0;
function save(name, buf) {
  try { fs.mkdirSync(LAST, { recursive: true }); fs.writeFileSync(path.join(LAST, `${Date.now()}-${name}`), buf);
    const files = fs.readdirSync(LAST).sort(); for (const f of files.slice(0, Math.max(0, files.length - 20))) fs.unlinkSync(path.join(LAST, f)); } catch { /* ignore */ }
}
let maskCache;
async function maskData(o) {
  if (maskCache) return maskCache;
  const c = createCanvas(512, 512); const x = c.getContext('2d');
  x.drawImage(await loadImage(path.resolve(ROOT, o.mask)), 0, 0, 512, 512);
  maskCache = { canvas: c, data: x.getImageData(0, 0, 512, 512).data }; return maskCache;
}
async function pixels(buf) { const c = createCanvas(512, 512); const x = c.getContext('2d'); x.drawImage(await loadImage(buf), 0, 0, 512, 512); return x.getImageData(0, 0, 512, 512).data; }
// Reject if the model redrew the scene (big change outside the mask) or did not change the character.
async function sanity(origBuf, editBuf, o) {
  const [a, b, { data: m }] = await Promise.all([pixels(origBuf), pixels(editBuf), maskData(o)]);
  let oi = 0, on = 0, ii = 0, inn = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    if (m[i] < 10) { oi += d; on++; } else if (m[i] > 200) { ii += d; inn++; }
  }
  const outside = oi / on, inside = ii / inn;
  return { outside, inside, ok: outside < (o.maxOutsideDiff ?? 35) && inside > (o.minInsideDiff ?? 12) };
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
  save('raw-openrouter.png', buf);
  return composite(sceneBuf, { full: buf }, o);
}

// Paste only the character region back onto the original scene (feathered edges, no seams).
async function composite(sceneBuf, out, o) {
  const scene = await loadImage(sceneBuf); const W = scene.width, H = scene.height;
  const c = createCanvas(W, H); const x = c.getContext('2d'); x.drawImage(scene, 0, 0);
  if (out.crop) { // paste ONLY the masked character area; everything else stays original pixels
    const { crop: C } = o; const ed = await loadImage(out.crop); const { canvas: mk } = await maskData(o);
    const md = mk.getContext('2d').getImageData(0, 0, 512, 512).data; // greyscale mask -> alpha
    const e = createCanvas(512, 512); const ex = e.getContext('2d'); ex.drawImage(ed, 0, 0, 512, 512);
    const ed2 = ex.getImageData(0, 0, 512, 512); for (let i = 0; i < md.length; i += 4) ed2.data[i + 3] = md[i]; ex.putImageData(ed2, 0, 0);
    x.drawImage(e, C.x, C.y, C.w, C.h);
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
    const res = await Promise.race([fn(sceneBuf, avatarBuf, o).catch(e => { console.warn('[ai]', e.message); return null; }),
      new Promise(r => { timer = setTimeout(() => r(null), o.timeoutMs); })]);
    if (res) save('final.png', res); return res;
  } catch (e) { console.warn('[ai]', e.message); return null; } finally { clearTimeout(timer); }
}
module.exports = { sceneEdit, provider, matchVerdict };

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
