// One pipeline for joins and /welcome-config preview: AI scene edit first, then purple template, else null (text only).
const { renderWelcome } = require('./image');
const { sceneEdit, provider } = require('../ai/scene-edit');

const usage = { day: '', count: 0 }; // AI images made today (resets daily, IST)
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function getAvatar(urls, fetcher) {
  for (const u of urls) {
    try {
      if (fetcher) return await fetcher(u);
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* try next */ }
  }
  return null;
}

async function buildWelcomeImage(o, cfg, deps = {}) {
  const log = deps.logger || console;
  const ai = cfg.ai || {};
  if (ai.enabled && (deps.sceneEdit || provider() !== 'off')) {
    if (usage.day !== today()) { usage.day = today(); usage.count = 0; }
    if (ai.dailyLimit > 0 && usage.count >= ai.dailyLimit) log.warn('[ai] daily limit reached; using template');
    else {
      try {
        const av = await getAvatar(o.avatarUrls, deps.fetcher);
        const png = av && await (deps.sceneEdit || sceneEdit)(av, ai);
        if (png) { usage.count++; return { png, kind: 'ai' }; }
        log.warn('[ai] no AI image; using template');
      } catch (e) { log.warn(`[ai] failed (${e.message}); using template`); }
    }
  }
  try {
    return { png: await (deps.render || renderWelcome)({ ...o, fetcher: deps.fetcher }), kind: 'template' };
  } catch (e) { log.error(`[welcome] Image render failed (${e.message}); sending text only.`); return null; }
}
module.exports = { buildWelcomeImage, _usage: usage };
