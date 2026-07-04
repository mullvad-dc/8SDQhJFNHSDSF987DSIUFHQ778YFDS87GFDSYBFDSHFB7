const { Client, GatewayIntentBits, EmbedBuilder, Collection, PermissionsBitField, ActivityType, ChannelType, AuditLogEvent } = require('discord.js');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ]
});

// ========== CONSTANTES ==========
const PREFIX = '!';
const TOKEN = process.env.PROTECT_TOKEN;

// IDs des salons de logs
const LOGS = {
  tickets: '1522768424777027754',
  messages: '1523019843962409075',
  vocal: '1523019863038230719',
  moderation: '1523019886383730718',
  autorank: '1523020033750466722',
  commandes: '1523020063546933338',
  joinleave: '1523020189195567276',
  roles: '1523020431034945758',
  salons: '1523020466871075017',
  systeme: '1523020509166436475',
  bots: '1523020554246951093',
  raids: '1523020721100554312' // ⚠️ À REMPLACER par l'ID de votre salon de logs raids
};

// IDs des rôles (permis)
const ROLES = {
  muteUnmute: '1522759758338064384',
  ticket: '1522759354774716556',
  fullPerms: ['1522757429501362307', '1522757708946604083', '1522757813074530416'],
  admin: '1522757813074530416' // inclus dans fullPerms
};

// Cooldowns (en ms)
const COOLDOWNS = {
  bl: 15 * 60 * 1000,
  timeout: 10 * 60 * 1000,
  kick: 15 * 60 * 1000,
  everyone: 2 * 60 * 1000
};

// État mémoire
const antiLinkEnabled = new Map(); // guildId -> boolean
const cooldowns = new Map(); // userId -> { command: timestamp }
const everyoneCooldown = new Map(); // userId -> timestamp

// ========== FONCTIONS UTILITAIRES ==========
function getLogChannel(guild, type) {
  const id = LOGS[type];
  if (!id) return null;
  return guild.channels.cache.get(id);
}

async function sendLog(guild, type, content, embed = null) {
  const channel = getLogChannel(guild, type);
  if (!channel) return;
  try {
    if (embed) await channel.send({ embeds: [embed] });
    else await channel.send(content);
  } catch (e) { /* ignore */ }
}

function hasPermission(member, command) {
  // Admin bypass tout
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const roles = member.roles.cache.map(r => r.id);
  // fullPerms peuvent tout
  for (const id of ROLES.fullPerms) {
    if (roles.includes(id)) return true;
  }
  // Mute/unmute spécifique
  if (command === 'mute' || command === 'unmute') {
    if (roles.includes(ROLES.muteUnmute)) return true;
  }
  // Ticket
  if (command === 'ticket') {
    if (roles.includes(ROLES.ticket)) return true;
  }
  return false;
}

function hasAdminPerm(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const roles = member.roles.cache.map(r => r.id);
  for (const id of ROLES.fullPerms) {
    if (roles.includes(id)) return true;
  }
  return false;
}

function canBypassCooldown(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
         member.roles.cache.some(r => ROLES.fullPerms.includes(r.id));
}

function checkCooldown(userId, command, member) {
  if (canBypassCooldown(member)) return true;
  const key = `${userId}-${command}`;
  const last = cooldowns.get(key);
  const now = Date.now();
  const cd = COOLDOWNS[command];
  if (!cd) return true;
  if (last && (now - last) < cd) {
    return false;
  }
  cooldowns.set(key, now);
  return true;
}

// ========== LOG DE RAID (exemple simple) ==========
let joinCount = 0;
let joinTimer = null;

client.on('guildMemberAdd', async member => {
  // Log join/leave
  const embed = new EmbedBuilder()
    .setColor('#00ffb9')
    .setTitle('📥 Arrivée')
    .setDescription(`${member.user.tag} (${member.id}) a rejoint le serveur.`)
    .setTimestamp();
  await sendLog(member.guild, 'joinleave', null, embed);

  // Détection de raid (join massif)
  joinCount++;
  if (!joinTimer) {
    joinTimer = setTimeout(async () => {
      if (joinCount >= 5) {
        const raidEmbed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('🚨 RAID DÉTECTÉ')
          .setDescription(`${joinCount} membres ont rejoint en 10 secondes.`)
          .setTimestamp();
        await sendLog(member.guild, 'raids', null, raidEmbed);
      }
      joinCount = 0;
      joinTimer = null;
    }, 10000);
  }

  // Anti-bot
  if (member.user.bot) {
    const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
    const entry = audit.entries.first();
    if (entry && entry.executor) {
      const executor = await member.guild.members.fetch(entry.executor.id);
      if (!hasAdminPerm(executor)) {
        try {
          await member.kick('Bot ajouté par un non-admin');
          const logEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🤖 Bot refusé')
            .setDescription(`${member.user.tag} a été kick (ajouté par ${executor.user.tag})`)
            .setTimestamp();
          await sendLog(member.guild, 'bots', null, logEmbed);
        } catch (e) {
          const logEmbed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('⚠️ Impossible de kick le bot')
            .setDescription(`${member.user.tag} a été ajouté par ${executor.user.tag} mais je n'ai pas pu le kick.`)
            .setTimestamp();
          await sendLog(member.guild, 'bots', null, logEmbed);
        }
      }
    }
  }
});

// ========== GESTION DES SALONS (anti-channel) ==========
client.on('channelCreate', async channel => {
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const entry = audit.entries.first();
  if (entry && entry.executor) {
    const executor = await channel.guild.members.fetch(entry.executor.id);
    if (!hasAdminPerm(executor)) {
      try {
        await channel.delete('Création par un non-admin');
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('🚫 Salon supprimé')
          .setDescription(`Le salon ${channel.name} a été créé par ${executor.user.tag} et supprimé automatiquement.`)
          .setTimestamp();
        await sendLog(channel.guild, 'salons', null, embed);
      } catch (e) { /* ignore */ }
    }
  }
});

client.on('channelDelete', async channel => {
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = audit.entries.first();
  if (entry && entry.executor) {
    const executor = await channel.guild.members.fetch(entry.executor.id);
    if (!hasAdminPerm(executor)) {
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('⚠️ Salon supprimé par un non-admin')
        .setDescription(`${executor.user.tag} a supprimé le salon ${channel.name}.`)
        .setTimestamp();
      await sendLog(channel.guild, 'salons', null, embed);
    }
  }
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
  const audit = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 });
  const entry = audit.entries.first();
  if (entry && entry.executor) {
    const executor = await newChannel.guild.members.fetch(entry.executor.id);
    if (!hasAdminPerm(executor)) {
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('⚠️ Salon modifié par un non-admin')
        .setDescription(`${executor.user.tag} a modifié le salon ${newChannel.name}.`)
        .setTimestamp();
      await sendLog(newChannel.guild, 'salons', null, embed);
    }
  }
});

// ========== ANTI-LINK ==========
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const enabled = antiLinkEnabled.get(message.guild.id) || false;
  if (enabled && !hasAdminPerm(message.member)) {
    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|\.gg\/[^\s]+)/gi;
    if (linkRegex.test(message.content)) {
      try {
        await message.delete();
        const warnMsg = await message.channel.send(`${message.author}, les liens sont interdits ici !`);
        setTimeout(() => warnMsg.delete().catch(()=>{}), 5000);
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('🔗 Lien bloqué')
          .setDescription(`${message.author.tag} a tenté d'envoyer un lien : ${message.content}`)
          .setTimestamp();
        await sendLog(message.guild, 'messages', null, embed);
      } catch (e) { /* ignore */ }
      return;
    }
  }

  // Anti-everyone
  if (message.content.includes('@everyone') || message.content.includes('@here')) {
    const last = everyoneCooldown.get(message.author.id) || 0;
    const now = Date.now();
    if (now - last < COOLDOWNS.everyone && !hasAdminPerm(message.member)) {
      try {
        await message.delete();
        const warnMsg = await message.channel.send(`${message.author}, vous ne pouvez ping @everyone qu'une fois toutes les 2 minutes.`);
        setTimeout(() => warnMsg.delete().catch(()=>{}), 5000);
        const embed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('⚠️ @everyone bloqué')
          .setDescription(`${message.author.tag} a tenté de ping @everyone.`)
          .setTimestamp();
        await sendLog(message.guild, 'messages', null, embed);
      } catch (e) { /* ignore */ }
      return;
    } else if (!hasAdminPerm(message.member)) {
      everyoneCooldown.set(message.author.id, now);
    }
  }
});

// ========== COMMANDES ==========
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const member = message.member;

  // Log commande (sauf help)
  if (command !== 'help') {
    const embed = new EmbedBuilder()
      .setColor('#00ffb9')
      .setTitle('📝 Commande exécutée')
      .setDescription(`${member.user.tag} a utilisé \`!${command} ${args.join(' ')}\``)
      .setTimestamp();
    await sendLog(message.guild, 'commandes', null, embed);
  }

  // ========== HELP ==========
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#00ffb9')
      .setTitle('🛡️ Sainte protect - Aide')
      .setDescription(`
**Commandes de modération :**
\`!bl <user> <raison>\` - Bannir (cooldown 15min)
\`!unbl <user>\` - Débannir
\`!mute <user> <durée>\` - Timeout (ex: 10m, 1h)
\`!unmute <user>\` - Retirer timeout
\`!kick <user> <raison>\` - Kick (cooldown 15min)

**Sécurité :**
\`!anti-link\` - Active/désactive le blocage des liens (admin)
\`!lock\` - Verrouille tous les salons (admin)
\`!unlock\` - Déverrouille tous les salons (admin)

**Utilitaires :**
\`!clear <n>\` - Supprime n messages (admin)
\`!clean\` - Supprime tous les messages du salon (admin)
\`!setstatus <playing|streaming> <texte>\` - Change le statut du bot

**Systèmes actifs :**
• Anti-bot (refuse les bots ajoutés par non-admin)
• Anti-channel (supprime les salons créés/modifiés par non-admin)
• Anti-everyone (cooldown 2min par utilisateur)
• Logs complets dans les salons dédiés
      `)
      .setFooter({ text: '🔱 Sysnet • 19/07/2026' });
    return message.channel.send({ embeds: [embed] });
  }

  // Vérifier permissions
  if (['bl', 'unbl', 'kick', 'mute', 'unmute'].includes(command)) {
    if (!hasPermission(member, command)) {
      return message.channel.send('❌ Vous n\'avez pas la permission d\'utiliser cette commande.')
        .then(m => setTimeout(() => m.delete().catch(()=>{}), 10000));
    }
  }
  if (['anti-link', 'lock', 'unlock', 'clear', 'clean', 'setstatus'].includes(command)) {
    if (!hasAdminPerm(member)) {
      return message.channel.send('❌ Commande réservée aux administrateurs.')
        .then(m => setTimeout(() => m.delete().catch(()=>{}), 10000));
    }
  }

  // ========== BL ==========
  if (command === 'bl') {
    const target = message.mentions.users.first() || client.users.cache.get(args[0]);
    if (!target) return message.channel.send('❌ Utilisateur invalide.').then(m => setTimeout(() => m.delete(), 10000));
    if (!checkCooldown(member.id, 'bl', member)) {
      return message.channel.send('⏳ Cooldown 15min, veuillez patienter.').then(m => setTimeout(() => m.delete(), 10000));
    }
    const reason = args.slice(1).join(' ') || 'Aucune raison';
    try {
      await message.guild.members.ban(target, { reason });
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔨 Ban')
        .setDescription(`${target.tag} a été banni par ${member.user.tag}`)
        .addFields({ name: 'Raison', value: reason })
        .setTimestamp();
      await sendLog(message.guild, 'moderation', null, embed);
      message.channel.send(`✅ ${target.tag} a été banni.`).then(m => setTimeout(() => m.delete(), 5000));
    } catch (e) {
      message.channel.send('❌ Erreur lors du ban.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== UNBL ==========
  if (command === 'unbl') {
    const target = args[0];
    if (!target) return message.channel.send('❌ ID utilisateur requis.').then(m => setTimeout(() => m.delete(), 10000));
    try {
      await message.guild.members.unban(target);
      const embed = new EmbedBuilder()
        .setColor('#00ffb9')
        .setTitle('🔓 Unban')
        .setDescription(`L'utilisateur ${target} a été débanni par ${member.user.tag}`)
        .setTimestamp();
      await sendLog(message.guild, 'moderation', null, embed);
      message.channel.send(`✅ Utilisateur ${target} débanni.`).then(m => setTimeout(() => m.delete(), 5000));
    } catch (e) {
      message.channel.send('❌ Erreur lors du unban.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== KICK ==========
  if (command === 'kick') {
    const target = message.mentions.users.first() || client.users.cache.get(args[0]);
    if (!target) return message.channel.send('❌ Utilisateur invalide.').then(m => setTimeout(() => m.delete(), 10000));
    if (!checkCooldown(member.id, 'kick', member)) {
      return message.channel.send('⏳ Cooldown 15min, veuillez patienter.').then(m => setTimeout(() => m.delete(), 10000));
    }
    const reason = args.slice(1).join(' ') || 'Aucune raison';
    try {
      const targetMember = await message.guild.members.fetch(target.id);
      await targetMember.kick(reason);
      try {
        await target.send(`Vous avez été kick du serveur 🔱 Sysnet pour la raison : ${reason}. Vous pouvez revenir avec ce lien : discord.gg/teadMR4zgG`);
      } catch (e) { /* ignore */ }
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('👢 Kick')
        .setDescription(`${target.tag} a été kick par ${member.user.tag}`)
        .addFields({ name: 'Raison', value: reason })
        .setTimestamp();
      await sendLog(message.guild, 'moderation', null, embed);
      message.channel.send(`✅ ${target.tag} a été kick.`).then(m => setTimeout(() => m.delete(), 5000));
    } catch (e) {
      message.channel.send('❌ Erreur lors du kick.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== MUTE ==========
  if (command === 'mute') {
    const target = message.mentions.users.first() || client.users.cache.get(args[0]);
    if (!target) return message.channel.send('❌ Utilisateur invalide.').then(m => setTimeout(() => m.delete(), 10000));
    if (!checkCooldown(member.id, 'timeout', member)) {
      return message.channel.send('⏳ Cooldown 10min, veuillez patienter.').then(m => setTimeout(() => m.delete(), 10000));
    }
    const durationStr = args[1];
    if (!durationStr) return message.channel.send('❌ Durée requise (ex: 10m, 1h).').then(m => setTimeout(() => m.delete(), 10000));
    const durationMs = parseDuration(durationStr);
    if (!durationMs) return message.channel.send('❌ Format de durée invalide.').then(m => setTimeout(() => m.delete(), 10000));
    const reason = args.slice(2).join(' ') || 'Aucune raison';
    try {
      const targetMember = await message.guild.members.fetch(target.id);
      await targetMember.timeout(durationMs, reason);
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🔇 Mute')
        .setDescription(`${target.tag} a été mute par ${member.user.tag} pour ${durationStr}`)
        .addFields({ name: 'Raison', value: reason })
        .setTimestamp();
      await sendLog(message.guild, 'moderation', null, embed);
      message.channel.send(`✅ ${target.tag} a été mute pour ${durationStr}.`).then(m => setTimeout(() => m.delete(), 5000));
    } catch (e) {
      message.channel.send('❌ Erreur lors du mute.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== UNMUTE ==========
  if (command === 'unmute') {
    const target = message.mentions.users.first() || client.users.cache.get(args[0]);
    if (!target) return message.channel.send('❌ Utilisateur invalide.').then(m => setTimeout(() => m.delete(), 10000));
    try {
      const targetMember = await message.guild.members.fetch(target.id);
      await targetMember.timeout(null);
      const embed = new EmbedBuilder()
        .setColor('#00ffb9')
        .setTitle('🔊 Unmute')
        .setDescription(`${target.tag} a été unmute par ${member.user.tag}`)
        .setTimestamp();
      await sendLog(message.guild, 'moderation', null, embed);
      message.channel.send(`✅ ${target.tag} a été unmute.`).then(m => setTimeout(() => m.delete(), 5000));
    } catch (e) {
      message.channel.send('❌ Erreur lors du unmute.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== ANTI-LINK ==========
  if (command === 'anti-link') {
    const current = antiLinkEnabled.get(message.guild.id) || false;
    antiLinkEnabled.set(message.guild.id, !current);
    const status = !current ? 'activé' : 'désactivé';
    message.channel.send(`🔗 Anti-link ${status}.`).then(m => setTimeout(() => m.delete(), 5000));
    const embed = new EmbedBuilder()
      .setColor('#00ffb9')
      .setTitle('🔄 Anti-link modifié')
      .setDescription(`Par ${member.user.tag} : maintenant ${status}`)
      .setTimestamp();
    await sendLog(message.guild, 'systeme', null, embed);
  }

  // ========== LOCK ==========
  if (command === 'lock') {
    const channels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    let count = 0;
    for (const [, ch] of channels) {
      try {
        await ch.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
        count++;
      } catch (e) { /* ignore */ }
    }
    message.channel.send(`🔒 ${count} salons verrouillés.`).then(m => setTimeout(() => m.delete(), 5000));
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🔒 Lock global')
      .setDescription(`Tous les salons ont été verrouillés par ${member.user.tag}`)
      .setTimestamp();
    await sendLog(message.guild, 'systeme', null, embed);
  }

  // ========== UNLOCK ==========
  if (command === 'unlock') {
    const channels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    let count = 0;
    for (const [, ch] of channels) {
      try {
        await ch.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
        count++;
      } catch (e) { /* ignore */ }
    }
    message.channel.send(`🔓 ${count} salons déverrouillés.`).then(m => setTimeout(() => m.delete(), 5000));
    const embed = new EmbedBuilder()
      .setColor('#00ffb9')
      .setTitle('🔓 Unlock global')
      .setDescription(`Tous les salons ont été déverrouillés par ${member.user.tag}`)
      .setTimestamp();
    await sendLog(message.guild, 'systeme', null, embed);
  }

  // ========== CLEAR ==========
  if (command === 'clear') {
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.channel.send('❌ Nombre entre 1 et 100.').then(m => setTimeout(() => m.delete(), 10000));
    try {
      const messages = await message.channel.bulkDelete(amount, true);
      const msg = await message.channel.send(`🗑️ ${messages.size} messages supprimés.`);
      setTimeout(() => msg.delete().catch(()=>{}), 5000);
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🧹 Clear')
        .setDescription(`${member.user.tag} a supprimé ${messages.size} messages dans ${message.channel.name}`)
        .setTimestamp();
      await sendLog(message.guild, 'messages', null, embed);
    } catch (e) {
      message.channel.send('❌ Erreur lors du clear.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== CLEAN ==========
  if (command === 'clean') {
    try {
      let fetched;
      do {
        fetched = await message.channel.messages.fetch({ limit: 100 });
        await message.channel.bulkDelete(fetched, true);
      } while (fetched.size >= 100);
      const msg = await message.channel.send('🧹 Salon nettoyé.');
      setTimeout(() => msg.delete().catch(()=>{}), 5000);
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🧹 Clean')
        .setDescription(`${member.user.tag} a nettoyé le salon ${message.channel.name}`)
        .setTimestamp();
      await sendLog(message.guild, 'messages', null, embed);
    } catch (e) {
      message.channel.send('❌ Erreur lors du clean.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== SETSTATUS ==========
  if (command === 'setstatus') {
    const type = args[0]?.toLowerCase();
    const text = args.slice(1).join(' ');
    if (!type || !text) return message.channel.send('❌ Usage: !setstatus <playing|streaming> <texte>').then(m => setTimeout(() => m.delete(), 10000));
    if (type === 'playing') {
      client.user.setActivity(text, { type: ActivityType.Playing });
    } else if (type === 'streaming') {
      client.user.setActivity(text, { type: ActivityType.Streaming, url: 'https://twitch.tv/sysnet' });
    } else {
      return message.channel.send('❌ Type doit être "playing" ou "streaming".').then(m => setTimeout(() => m.delete(), 10000));
    }
    message.channel.send(`✅ Statut mis à jour : ${type} ${text}`).then(m => setTimeout(() => m.delete(), 5000));
  }
});

// ========== FONCTIONS D'AIDE ==========
function parseDuration(str) {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

// ========== CONNEXION ==========
client.once('ready', () => {
  console.log(`✅ Protect bot connecté en tant que ${client.user.tag}`);
  client.user.setActivity("j'protege tout le monde", { type: ActivityType.Playing });
});

client.login(TOKEN);
