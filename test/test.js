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
    guild: { id: 'g1', name: 'Exquisite', memberCount: 1234, members: { me: {} },
      channels: { cache: new Map([[ch.id, ch]]), fetch: async () => null } } };
}
const avatarFetcher = async () => { const c = createCanvas(256, 256); const x = c.getContext('2d'); x.fillStyle = '#e11d48'; x.fillRect(0, 0, 256, 256); return c.toBuffer('image/png'); };
const cfg = { ...loadConfig(), welcomeChannelId: '999' };
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('✔', n); };

(async () => {
  await t('mention + placeholders', async () => {
    const ch = mkChannel(); const r = await handleJoin(mkMember('111', ch), cfg, { logger: quiet, fetcher: avatarFetcher });
    assert(r.sent); const p = ch.sent[0];
    assert(p.content.startsWith('Welcome <@111>!')); assert(p.content.includes('**Exquisite**')); assert(p.content.includes('#1234'));
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
    const ch = mkChannel(); await handleJoin(mkMember('333', ch), cfg, { logger: quiet, render: async () => { throw new Error('boom'); } });
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
  console.log(`\n${pass}/8 tests passed. template size verified.`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
