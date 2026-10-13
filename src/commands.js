const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, AttachmentBuilder } = require('discord.js');
const { loadConfig, saveConfig } = require('./config');
const { fill } = require('./welcome');
const { renderWelcome } = require('./image');

const command = new SlashCommandBuilder()
  .setName('welcome-config').setDescription('Configure the welcome message (admins only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand(s => s.setName('set-channel').setDescription('Set the welcome channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand(s => s.setName('set-message').setDescription('Set welcome text. Use \\n for new lines.')
    .addStringOption(o => o.setName('text').setDescription('Placeholders: {user_mention} {username} {display_name} {server_name} {member_count}').setRequired(true).setMaxLength(1900)))
  .addSubcommand(s => s.setName('image').setDescription('Turn welcome image on/off')
    .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)))
  .addSubcommand(s => s.setName('preview').setDescription('Preview the welcome (only you see it)'))
  .addSubcommand(s => s.setName('show').setDescription('Show current settings (only you see it)'));

async function handleInteraction(i) {
  if (!i.isChatInputCommand() || i.commandName !== 'welcome-config') return;
  const eph = { flags: MessageFlags.Ephemeral };
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !i.memberPermissions?.has(PermissionFlagsBits.Administrator))
    return i.reply({ content: 'You need Manage Server or Administrator.', ...eph });
  const cfg = loadConfig();
  const sub = i.options.getSubcommand();
  try {
    if (sub === 'set-channel') { cfg.welcomeChannelId = i.options.getChannel('channel').id; saveConfig(cfg); return i.reply({ content: `Welcome channel set to <#${cfg.welcomeChannelId}>.`, ...eph }); }
    if (sub === 'set-message') { cfg.message = i.options.getString('text').replace(/\\n/g, '\n'); saveConfig(cfg); return i.reply({ content: 'Welcome message updated.', ...eph }); }
    if (sub === 'image') { cfg.image.enabled = i.options.getBoolean('enabled'); saveConfig(cfg); return i.reply({ content: `Welcome image ${cfg.image.enabled ? 'enabled' : 'disabled'}.`, ...eph }); }
    if (sub === 'show') return i.reply({ content: '```json\n' + JSON.stringify(cfg, null, 2).slice(0, 1800) + '\n```', ...eph });
    if (sub === 'preview') {
      await i.deferReply(eph);
      const member = i.member;
      const serverName = cfg.serverName || i.guild.name;
      const payload = { content: fill(cfg.message, member, serverName), allowedMentions: { parse: [] } };
      if (cfg.image.enabled) {
        try {
          const png = await renderWelcome({ displayName: member.displayName, memberCount: member.guild.memberCount, serverName,
            avatarUrls: [member.displayAvatarURL({ extension: 'png', size: 256 }), member.user.defaultAvatarURL],
            config: { ...cfg.image, title: fill(cfg.image.title, member, serverName), subtitle: fill(cfg.image.subtitle, member, serverName) } });
          payload.files = [new AttachmentBuilder(png, { name: 'welcome.png' })];
        } catch (e) { payload.content += `\n\n(image render failed: ${e.message})`; }
      }
      return i.editReply(payload);
    }
  } catch (e) {
    console.error(`[commands] ${sub} failed: ${e.message}`);
    const msg = { content: 'Something went wrong; check bot logs.', ...eph };
    return (i.deferred || i.replied) ? i.editReply(msg).catch(() => {}) : i.reply(msg).catch(() => {});
  }
}
module.exports = { command, handleInteraction };
