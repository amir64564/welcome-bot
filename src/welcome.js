const { PermissionFlagsBits, ChannelType, AttachmentBuilder } = require('discord.js');
const { buildWelcomeImage } = require('./welcome-image');

const DEDUPE_MS = 60_000;
const recent = new Map(); // guildId:userId -> timestamp

function isDuplicate(guildId, userId, now = Date.now()) {
  for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k); // prune lazily, no timers
  const key = `${guildId}:${userId}`;
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}
function fill(template, member, serverName) {
  const vals = {
    user_mention: `<@${member.id}>`,
    username: member.user.username,
    display_name: member.displayName,
    server_name: serverName,
    member_count: String(member.guild.memberCount ?? ''),
  };
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}

function imageOpts(member, cfg, serverName) {
  return { displayName: member.displayName, memberCount: member.guild.memberCount, serverName,
    avatarUrls: [member.displayAvatarURL({ extension: 'png', size: 256 }), member.user.defaultAvatarURL],
    config: { ...cfg.image, title: fill(cfg.image.title, member, serverName), subtitle: fill(cfg.image.subtitle, member, serverName) } };
}

async function handleJoin(member, cfg, deps = {}) {
  const log = deps.logger || console;
  try {
    if (member.user?.bot && cfg.ignoreBots) return { skipped: 'bot' };
    if (isDuplicate(member.guild.id, member.id)) return { skipped: 'duplicate' };
    if (!cfg.welcomeChannelId) { log.warn('[welcome] welcomeChannelId not configured; skipping.'); return { skipped: 'no-channel-config' }; }

    const channel = member.guild.channels.cache.get(cfg.welcomeChannelId)
      || await member.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null);
    if (!channel || !channel.isTextBased?.() || channel.type === ChannelType.GuildVoice) {
      log.warn(`[welcome] Channel ${cfg.welcomeChannelId} not found or not a text channel; skipping.`);
      return { skipped: 'invalid-channel' };
    }
    const me = member.guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    const need = [['ViewChannel', PermissionFlagsBits.ViewChannel], ['SendMessages', PermissionFlagsBits.SendMessages]];
    const missing = need.filter(([, f]) => !perms?.has(f)).map(([n]) => n);
    if (missing.length) { log.warn(`[welcome] Missing permissions in #${channel.name}: ${missing.join(', ')}; skipping.`); return { skipped: 'missing-permissions', missing }; }
    const canAttach = perms.has(PermissionFlagsBits.AttachFiles) && perms.has(PermissionFlagsBits.EmbedLinks);
    if (cfg.image?.enabled && !canAttach) log.warn('[welcome] Missing AttachFiles/EmbedLinks; sending text only.');

    const serverName = cfg.serverName || member.guild.name;
    const payload = {
      content: fill(cfg.message, member, serverName),
      allowedMentions: { users: [member.id], roles: [], parse: [] },
    };
    let imageKind = null;
    if (cfg.image?.enabled && canAttach) {
      const img = await buildWelcomeImage(imageOpts(member, cfg, serverName), cfg, deps);
      if (img) { payload.files = [new AttachmentBuilder(img.png, { name: 'welcome.png' })]; imageKind = img.kind; }
    }
    await channel.send(payload);
    return { sent: true, payload, imageKind };
  } catch (e) {
    log.error(`[welcome] Failed to welcome ${member?.id}: ${e.message}`);
    return { error: e.message };
  }
}
module.exports = { handleJoin, fill, imageOpts, isDuplicate, _recent: recent, DEDUPE_MS };
