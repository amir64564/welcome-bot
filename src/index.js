require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { loadConfig } = require('./config');
const { handleJoin } = require('./welcome');
const { command, handleInteraction } = require('./commands');

process.on('unhandledRejection', e => console.error('[process] unhandledRejection:', e?.message || e));
process.on('uncaughtException', e => console.error('[process] uncaughtException:', e?.message || e));

const token = process.env.DISCORD_TOKEN;
if (!token) { console.error('DISCORD_TOKEN missing in .env'); process.exit(1); }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once(Events.ClientReady, async c => {
  console.log(`[ready] Logged in as ${c.user.tag}`);
  try { await c.application.commands.set([command.toJSON()]); console.log('[ready] /welcome-config registered'); }
  catch (e) { console.warn(`[ready] Could not register slash commands: ${e.message}`); }
});
// Only real join events trigger a welcome. Nothing is sent on startup.
client.on(Events.GuildMemberAdd, member => handleJoin(member, loadConfig()));
client.on(Events.InteractionCreate, i => handleInteraction(i).catch(e => console.error('[commands]', e.message)));
client.on(Events.Error, e => console.error('[client]', e.message));

client.login(token).catch(e => { console.error(`[login] Failed: ${e.message}`); process.exit(1); });
