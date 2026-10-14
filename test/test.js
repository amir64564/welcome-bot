const assert = require('assert'); const fs = require('fs'); const path = require('path');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const { handleJoin, _recent } = require('../src/welcome');
const { loadConfig } = require('../src/config');

const quiet = { warn: m => logs.push(m), error: m => logs.push(m) }; let logs = [];
const ALL = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles];
function mkChannel(perms = ALL) {
  const ch = { id: '999', name: 'welcome', type: ChannelType.GuildText, sent: [], isTextBased: () => true,
    permissionsFor: () => ({ has: f => perms.includes(f) }), send: async p => { ch.sent.push(p); } };
  return ch;
}
function mkMember(id, ch, name = 'Rudra The Very Long Display Name That Should Be Truncated Nicely') {
  return { id, displayName: name, user: { username: 'rudra_' + id, bot: false, defaultAvatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' },
    displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/x.png?size=256`,
    guild: { id: 'g1', name: 'Test Server', memberCount: 1234, members: { me: {} },
      channels: { cache: new Map([[ch.id, ch]]), fetch: async () => null } } };
}
const avatarFetcher = async () => { const c = createCanvas(256, 256); const x = c.getContext('2d'); x.fillStyle = '#e11d48'; x.fillRect(0, 0, 256, 256); return c.toBuffer('image/png'); };
const cfg = { ...loadConfig(), welcomeChannelId: '999' };
process.env.AI_PROVIDER = 'off'; // offline: never call real AI
const aiNull = { sceneEdit: async () => null }; // mock AI that fails -> fallback
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('✔', n); };

(async () => {
  await t('mention + placeholders', async () => {
    const ch = mkChannel(); const r = await handleJoin(mkMember('111', ch), cfg, { logger: quiet, fetcher: avatarFetcher, ...aiNull });
    assert(r.sent); assert.strictEqual(r.imageKind, 'template'); const p = ch.sent[0];
    assert(p.content.startsWith('Welcome <@111>!')); assert(p.content.includes('**Test Server**')); assert(p.content.includes('#1234'));
    assert(!/\{\w+\}/.test(p.content)); assert.deepStrictEqual(p.allowedMentions.users, ['111']);
    assert.strictEqual(p.files[0].name, 'welcome.png');
    const buf = p.files[0].attachment; assert(buf.subarray(1, 4).toString() === 'PNG');
    assert.strictEqual(buf.readUInt32BE(16), 1672); assert.strictEqual(buf.readUInt32BE(20), 941);
  });
  await t('dedupe blocks identical second event', async () => {
    const ch = mkChannel(); const m = mkMember('111', ch);
    const r = await handleJoin(m, cfg, { logger: quiet }); assert.strictEqual(r.skipped, 'duplicate'); assert.strictEqual(ch.sent.length, 0);
  });
  await t('avatar fetch failure -> placeholder, still renders', async () => {
    const ch = mkChannel(); await handleJoin(mkMember('222', ch, 'Bob'), cfg, { logger: quiet, fetcher: async () => { throw new Error('404'); } });
    assert(ch.sent[0].files.length === 1);
  });
  await t('image render failure -> text only', async () => {
    const ch = mkChannel(); await handleJoin(mkMember('333', ch), cfg, { logger: quiet, render: async () => { throw new Error('boom'); }, ...aiNull });
    assert(ch.sent.length === 1 && !ch.sent[0].files && ch.sent[0].content.includes('<@333>'));
  });
  await t('missing SendMessages -> skip, no crash', async () => {
    const ch = mkChannel([PermissionFlagsBits.ViewChannel]); const r = await handleJoin(mkMember('444', ch), cfg, { logger: quiet });
    assert.strictEqual(r.skipped, 'missing-permissions'); assert.strictEqual(ch.sent.length, 0);
  });
  await t('missing AttachFiles -> text only', async () => {
    const ch = mkChannel([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    await handleJoin(mkMember('555', ch), cfg, { logger: quiet }); assert(ch.sent.length === 1 && !ch.sent[0].files);
  });
  await t('invalid channel -> skip', async () => {
    const ch = mkChannel(); const r = await handleJoin(mkMember('666', ch), { ...cfg, welcomeChannelId: 'nope' }, { logger: quiet });
    assert.strictEqual(r.skipped, 'invalid-channel');
  });
  await t('channel.send throws -> caught, bot stays alive', async () => {
    const ch = mkChannel(); ch.send = async () => { throw new Error('Missing Access'); };
    const r = await handleJoin(mkMember('777', ch), cfg, { logger: quiet }); assert(r.error);
  });
  await t('AI success -> AI image used', async () => {
    const ch = mkChannel(); const r = await handleJoin(mkMember('888', ch, 'Ai'), cfg, { logger: quiet, fetcher: avatarFetcher, sceneEdit: async () => Buffer.from('AIPNG') });
    assert.strictEqual(r.imageKind, 'ai'); assert.strictEqual(ch.sent[0].files[0].attachment.toString(), 'AIPNG');
  });
  await t('AI throws -> template fallback', async () => {
    const ch = mkChannel(); const r = await handleJoin(mkMember('889', ch, 'X'), cfg, { logger: quiet, fetcher: avatarFetcher, sceneEdit: async () => { throw new Error('quota'); } });
    assert.strictEqual(r.imageKind, 'template');
  });
  await t('AI disabled in config -> template, AI not called', async () => {
    let called = false; const ch = mkChannel();
    const r = await handleJoin(mkMember('890', ch, 'Y'), { ...cfg, ai: { ...cfg.ai, enabled: false } }, { logger: quiet, fetcher: avatarFetcher, sceneEdit: async () => { called = true; return Buffer.from('x'); } });
    assert(!called && r.imageKind === 'template');
  });
  await t('AI + template both fail -> text only', async () => {
    const ch = mkChannel(); await handleJoin(mkMember('891', ch, 'Z'), cfg, { logger: quiet, ...aiNull, render: async () => { throw new Error('boom'); } });
    assert(ch.sent.length === 1 && !ch.sent[0].files);
  });
  await t('daily limit -> template after cap', async () => {
    const lim = { ...cfg, ai: { ...cfg.ai, dailyLimit: 1 } }; const ok = { logger: quiet, fetcher: avatarFetcher, sceneEdit: async () => Buffer.from('AI') };
    require('../src/welcome-image')._usage.count = 0; require('../src/welcome-image')._usage.day = '';
    const a = await handleJoin(mkMember('892', mkChannel(), 'A'), lim, ok); const b = await handleJoin(mkMember('893', mkChannel(), 'B'), lim, ok);
    assert.strictEqual(a.imageKind, 'ai'); assert.strictEqual(b.imageKind, 'template');
  });
  await t('real sceneEdit with no provider -> null quickly', async () => {
    assert.strictEqual(await require('../ai/scene-edit').sceneEdit(Buffer.from('x')), null);
  });
  console.log(`\n${pass}/14 tests passed. template size verified.`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
