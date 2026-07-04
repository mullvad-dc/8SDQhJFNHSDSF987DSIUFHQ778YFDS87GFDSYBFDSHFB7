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
const TOKEN = process.env.TOKEN;
const EMBED_COLOR = '#f1c40f'; // ✅ Couleur jaune

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
  raids: 'ID_DU_SALON_RAIDS' // ⚠️ À REMPLACER
};

// IDs des rôles (permis)
const ROLES = {
  muteUnmute: '1522759758338064384',
  ticket: '1522759354774716556',
  fullPerms: ['1522757429501362307', '1522757708946604083', '1522757813074530416']
};

// IDs spécifiques pour les fonctionnalités Sysnet
const INVITE_CHANNEL_ID = '1522761566242607114';
const STATUT_CHANNEL_ID = '1522762774676115687';
const ROLE_STATUT_ID = '1522755616958054430';
const TICKET_CATEGORY_ID = 'ID_CATEGORIE_TICKETS'; // ⚠️ À REMPLACER

// Cooldowns (en ms)
const COOLDOWNS = {
  bl: 15 * 60 * 1000,
  timeout: 10 * 60 * 1000,
  kick: 15 * 60 * 1000,
  everyone: 2 * 60 * 1000
};

// ========== ÉTAT MÉMOIRE ==========
const antiLinkEnabled = new Map();
const cooldowns = new Map();
const everyoneCooldown = new Map();
const ticketConfigs = new Map();
const giveaways = new Map();

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
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const roles = member.roles.cache.map(r => r.id);
  for (const id of ROLES.fullPerms) {
    if (roles.includes(id)) return true;
  }
  if (command === 'mute' || command === 'unmute') {
    if (roles.includes(ROLES.muteUnmute)) return true;
  }
  if (command === 'ticket') {
    if (roles.includes(ROLES.ticket)) return true;
  }
  return false;
}

function hasAdminPerm(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return member.roles.cache.some(r => ROLES.fullPerms.includes(r.id));
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
  if (last && (now - last) < cd) return false;
  cooldowns.set(key, now);
  return true;
}

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

// ========== ANTI-BOT & DÉTECTION RAID ==========
let joinCount = 0;
let joinTimer = null;

client.on('guildMemberAdd', async member => {
  // Log join
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📥 Arrivée')
    .setDescription(`${member.user.tag} (${member.id}) a rejoint le serveur.`)
    .setTimestamp();
  await sendLog(member.guild, 'joinleave', null, embed);

  // Détection raid (5 membres en 10s)
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

  // Système d'invitations
  const invites = await member.guild.invites.fetch();
  if (!client.inviteCache) client.inviteCache = new Map();
  const cached = client.inviteCache.get(member.guild.id) || {};
  let inviter = null;
  for (const [code, invite] of invites) {
    const old = cached[code] || 0;
    if (invite.uses > old) {
      inviter = invite.inviter;
      break;
    }
  }
  const newCache = {};
  for (const [code, invite] of invites) {
    newCache[code] = invite.uses;
  }
  client.inviteCache.set(member.guild.id, newCache);

  const channel = member.guild.channels.cache.get(INVITE_CHANNEL_ID);
  if (channel) {
    const count = member.guild.memberCount;
    const inviterTag = inviter ? `<@${inviter.id}>` : 'inconnu';
    await channel.send(`${member.user} a rejoint, il a été invité par ${inviterTag}. Nous sommes maintenant **${count}** dans le serveur !`);
  }
});

// ========== ANTI-CHANNEL ==========
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

// ========== ANTI-LINK & ANTI-EVERYONE ==========
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Anti-link
  const enabled = antiLinkEnabled.get(message.guild.id) || false;
  if (enabled && !hasAdminPerm(message.member)) {
    const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+|\.gg\/[^\s]+)/gi;
    if (linkRegex.test(message.content)) {
      try {
        await message.delete();
        const warnMsg = await message.channel.send(`${message.author}, les liens sont interdits ici !`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
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
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
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

// ========== RÔLE VIA STATUT ==========
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence.guild) return;
  const member = newPresence.member;
  if (!member) return;
  const activity = newPresence.activities.find(a => a.type === ActivityType.Custom);
  if (activity && activity.state) {
    const statut = activity.state;
    const patterns = [
      /https:\/\/discord\.gg\/teadMR4zgG/,
      /discord\.gg\/teadMR4zgG/,
      /\.gg\/teadMR4zgG/,
      /\/teadMR4zgG/
    ];
    const hasLink = patterns.some(regex => regex.test(statut));
    const role = member.guild.roles.cache.get(ROLE_STATUT_ID);
    if (role) {
      if (hasLink && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('✅ Rôle attribué')
          .setDescription(`${member.user.tag} a reçu le rôle ${role.name} pour avoir le bon statut.`)
          .setTimestamp();
        await sendLog(member.guild, 'autorank', null, embed);
      } else if (!hasLink && member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        const embed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle('❌ Rôle retiré')
          .setDescription(`${member.user.tag} a perdu le rôle ${role.name} car le statut ne contient plus le lien.`)
          .setTimestamp();
        await sendLog(member.guild, 'autorank', null, embed);
      }
    }
  } else {
    const role = member.guild.roles.cache.get(ROLE_STATUT_ID);
    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('❌ Rôle retiré')
        .setDescription(`${member.user.tag} a perdu le rôle ${role.name} car le statut a été supprimé.`)
        .setTimestamp();
      await sendLog(member.guild, 'autorank', null, embed);
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

  // Log commandes (sauf help)
  if (command !== 'help') {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('📝 Commande exécutée')
      .setDescription(`${member.user.tag} a utilisé \`!${command} ${args.join(' ')}\``)
      .setTimestamp();
    await sendLog(message.guild, 'commandes', null, embed);
  }

  // ========== HELP ==========
  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('🛡️ Sainte protect - Aide complète')
      .setDescription(`
**🔐 MODÉRATION :**
\`!bl <user> <raison>\` - Bannir (cooldown 15min)
\`!unbl <user>\` - Débannir
\`!mute <user> <durée>\` - Timeout (ex: 10m, 1h)
\`!unmute <user>\` - Retirer timeout
\`!kick <user> <raison>\` - Kick (cooldown 15min)

**🛡️ SÉCURITÉ :**
\`!anti-link\` - Active/désactive le blocage des liens (admin)
\`!lock\` - Verrouille tous les salons (admin)
\`!unlock\` - Déverrouille tous les salons (admin)

**🧹 UTILITAIRES :**
\`!clear <n>\` - Supprime n messages (admin)
\`!clean\` - Supprime tous les messages du salon (admin)
\`!setstatus <playing|streaming> <texte>\` - Change le statut du bot

**🎫 TICKETS :**
\`!ticket config set <champ> <valeur>\` - Configurer les tickets (admin)
Champs : titre, description, image, couleur, footer, options (3 séparées par ,)

**🎁 GIVEAWAYS :**
\`!giveaway #salon <durée> <nb_gagnants> <titre> | <description>\` - Lancer un giveaway (admin)
\`!giveaway force <ID_message> <@user>\` - Forcer un gagnant (admin)

**📝 MESSAGES :**
\`!message #salon "texte avec *n pour saut de ligne"\` - Envoyer un message
\`!embed #salon "titre" "description" "couleur" "image" "footer"\` - Envoyer un embed

**🔄 SYSTÈMES ACTIFS EN PERMANENCE :**
• Anti-bot (refuse les bots ajoutés par non-admin)
• Anti-channel (supprime les salons créés/modifiés par non-admin)
• Anti-everyone (cooldown 2min par utilisateur)
• Système d'invitations avec log
• Attribution de rôle via statut (vérification automatique)
      `)
      .setFooter({ text: '🔱 Sysnet • 19/07/2026' });
    return message.channel.send({ embeds: [embed] });
  }

  // ========== PERMISSIONS ==========
  if (['bl', 'unbl', 'kick', 'mute', 'unmute'].includes(command)) {
    if (!hasPermission(member, command)) {
      return message.channel.send('❌ Vous n\'avez pas la permission.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
  }
  if (['anti-link', 'lock', 'unlock', 'clear', 'clean', 'setstatus', 'giveaway', 'ticket'].includes(command)) {
    if (!hasAdminPerm(member)) {
      return message.channel.send('❌ Commande réservée aux administrateurs.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
  }

  // ========== BL ==========
  if (command === 'bl') {
    const target = message.mentions.users.first() || client.users.cache.get(args[0]);
    if (!target) return message.channel.send('❌ Utilisateur invalide.').then(m => setTimeout(() => m.delete(), 10000));
    if (!checkCooldown(member.id, 'bl', member)) {
      return message.channel.send('⏳ Cooldown 15min.').then(m => setTimeout(() => m.delete(), 10000));
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
      message.channel.send('❌ Erreur.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== UNBL ==========
  if (command === 'unbl') {
    const target = args[0];
    if (!target) return message.channel.send('❌ ID requis.').then(m => setTimeout(() => m.delete(), 10000));
    try {
      await message.guild.members.unban(target);
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🔓 Unban')
        .setDescription(`L'utilisateur ${target} a été débanni par ${member.user.tag}`)
        .setTimestamp();
      await sendLog(message.guild, 'moderation', null, embed);
      message.channel.send(`✅ Utilisateur ${target} débanni.`).then(m => setTimeout(() => m.delete(), 5000));
    } catch (e) {
      message.channel.send('❌ Erreur.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== KICK ==========
  if (command === 'kick') {
    const target = message.mentions.users.first() || client.users.cache.get(args[0]);
    if (!target) return message.channel.send('❌ Utilisateur invalide.').then(m => setTimeout(() => m.delete(), 10000));
    if (!checkCooldown(member.id, 'kick', member)) {
      return message.channel.send('⏳ Cooldown 15min.').then(m => setTimeout(() => m.delete(), 10000));
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
      message.channel.send('❌ Erreur.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== MUTE ==========
  if (command === 'mute') {
    const target = message.mentions.users.first() || client.users.cache.get(args[0]);
    if (!target) return message.channel.send('❌ Utilisateur invalide.').then(m => setTimeout(() => m.delete(), 10000));
    if (!checkCooldown(member.id, 'timeout', member)) {
      return message.channel.send('⏳ Cooldown 10min.').then(m => setTimeout(() => m.delete(), 10000));
    }
    const durationStr = args[1];
    if (!durationStr) return message.channel.send('❌ Durée requise (ex: 10m, 1h).').then(m => setTimeout(() => m.delete(), 10000));
    const durationMs = parseDuration(durationStr);
    if (!durationMs) return message.channel.send('❌ Format invalide.').then(m => setTimeout(() => m.delete(), 10000));
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
      message.channel.send('❌ Erreur.').then(m => setTimeout(() => m.delete(), 10000));
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
        .setColor(EMBED_COLOR)
        .setTitle('🔊 Unmute')
        .setDescription(`${target.tag} a été unmute par ${member.user.tag}`)
        .setTimestamp();
      await sendLog(message.guild, 'moderation', null, embed);
      message.channel.send(`✅ ${target.tag} a été unmute.`).then(m => setTimeout(() => m.delete(), 5000));
    } catch (e) {
      message.channel.send('❌ Erreur.').then(m => setTimeout(() => m.delete(), 10000));
    }
  }

  // ========== ANTI-LINK ==========
  if (command === 'anti-link') {
    const current = antiLinkEnabled.get(message.guild.id) || false;
    antiLinkEnabled.set(message.guild.id, !current);
    const status = !current ? 'activé' : 'désactivé';
    message.channel.send(`🔗 Anti-link ${status}.`).then(m => setTimeout(() => m.delete(), 5000));
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
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
      .setColor(EMBED_COLOR)
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
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🧹 Clear')
        .setDescription(`${member.user.tag} a supprimé ${messages.size} messages dans ${message.channel.name}`)
        .setTimestamp();
      await sendLog(message.guild, 'messages', null, embed);
    } catch (e) {
      message.channel.send('❌ Erreur.').then(m => setTimeout(() => m.delete(), 10000));
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
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      const embed = new EmbedBuilder()
        .setColor('#ff9900')
        .setTitle('🧹 Clean')
        .setDescription(`${member.user.tag} a nettoyé le salon ${message.channel.name}`)
        .setTimestamp();
      await sendLog(message.guild, 'messages', null, embed);
    } catch (e) {
      message.channel.send('❌ Erreur.').then(m => setTimeout(() => m.delete(), 10000));
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

  // ========== TICKET CONFIG ==========
  if (command === 'ticket' && args[0] === 'config' && args[1] === 'set') {
    const field = args[2];
    const value = args.slice(3).join(' ');
    if (!field || !value) return message.channel.send('❌ Usage: !ticket config set <titre|description|image|couleur|footer|options> <valeur>').then(m => setTimeout(() => m.delete(), 10000));
    const config = ticketConfigs.get(message.guild.id) || {
      title: '🎫 Support',
      description: 'Choisissez une option pour ouvrir un ticket.',
      image: null,
      color: EMBED_COLOR,
      footer: '🔱 Sysnet',
      options: ['Support Général', 'Réclamation', 'Question']
    };
    if (field === 'options') {
      const opts = value.split(',').map(s => s.trim());
      if (opts.length !== 3) return message.channel.send('❌ Exactement 3 options séparées par des virgules.').then(m => setTimeout(() => m.delete(), 10000));
      config.options = opts;
    } else if (field === 'couleur') {
      config.color = value;
    } else if (field === 'image') {
      config.image = value;
    } else {
      config[field] = value;
    }
    ticketConfigs.set(message.guild.id, config);
    message.channel.send(`✅ Champ "${field}" mis à jour.`).then(m => setTimeout(() => m.delete(), 5000));
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('📝 Configuration ticket modifiée')
      .setDescription(`${member.user.tag} a modifié ${field} : ${value}`)
      .setTimestamp();
    await sendLog(message.guild, 'systeme', null, embed);
  }

  // ========== GIVEAWAY ==========
  if (command === 'giveaway') {
    if (args[0] === 'force') {
      const msgId = args[1];
      const user = message.mentions.users.first();
      if (!msgId || !user) return message.channel.send('❌ Usage: !giveaway force <ID_message> <@user>').then(m => setTimeout(() => m.delete(), 10000));
      const giveawayData = giveaways.get(msgId);
      if (!giveawayData) return message.channel.send('❌ Giveaway introuvable.').then(m => setTimeout(() => m.delete(), 10000));
      const channel = await client.channels.fetch(giveawayData.channelId);
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('🎉 Gagnant du giveaway !')
          .setDescription(`Félicitations à ${user} ! Vous avez gagné : **${giveawayData.prize}**`)
          .setFooter({ text: 'Giveaway forcé par un administrateur' });
        await channel.send({ embeds: [embed] });
        const logEmbed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('🎁 Giveaway forcé')
          .setDescription(`${member.user.tag} a forcé le gagnant : ${user.tag}`)
          .addFields({ name: 'Message ID', value: msgId })
          .setTimestamp();
        await sendLog(message.guild, 'moderation', null, logEmbed);
      }
      giveaways.delete(msgId);
      return message.channel.send('✅ Gagnant annoncé.').then(m => setTimeout(() => m.delete(), 5000));
    }

    const duration = args[1];
    const winners = parseInt(args[2]);
    const title = args.slice(3).join(' ').split('|')[0]?.trim() || 'Giveaway';
    const description = args.slice(3).join(' ').split('|')[1]?.trim() || 'Bonne chance !';
    const channel = message.mentions.channels.first();
    if (!channel || !duration || !winners) return message.channel.send('❌ Usage: !giveaway #salon 10m 3 Titre | Description').then(m => setTimeout(() => m.delete(), 10000));
    const durationMs = parseDuration(duration);
    if (!durationMs) return message.channel.send('❌ Durée invalide (ex: 10m, 1h).').then(m => setTimeout(() => m.delete(), 10000));
    const endTime = Date.now() + durationMs;

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`🎁 ${title}`)
      .setDescription(description)
      .addFields(
        { name: 'Gagnants', value: `${winners}`, inline: true },
        { name: 'Fin', value: `<t:${Math.floor(endTime/1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Réagissez avec 🎉 pour participer !' });

    const msg = await channel.send({ embeds: [embed] });
    await msg.react('🎉');

    giveaways.set(msg.id, {
      endTime,
      channelId: channel.id,
      winners,
      prize: title,
      host: member.id
    });

    setTimeout(async () => {
      const data = giveaways.get(msg.id);
      if (!data) return;
      const fetchedMsg = await channel.messages.fetch(msg.id);
      const reaction = fetchedMsg.reactions.cache.get('🎉');
      if (!reaction) {
        const embedFail = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Giveaway terminé')
          .setDescription('Aucun participant, personne ne gagne.');
        await channel.send({ embeds: [embedFail] });
        giveaways.delete(msg.id);
        return;
      }
      const users = await reaction.users.fetch();
      const participants = users.filter(u => !u.bot);
      if (participants.size === 0) {
        const embedFail = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Giveaway terminé')
          .setDescription('Aucun participant, personne ne gagne.');
        await channel.send({ embeds: [embedFail] });
        giveaways.delete(msg.id);
        return;
      }
      const winner = participants.random(Math.min(data.winners, participants.size));
      const winnerMentions = winner.map(u => `<@${u.id}>`).join(', ');
      const embedWin = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🎉 Giveaway terminé !')
        .setDescription(`Félicitations à ${winnerMentions} ! Vous gagnez : **${data.prize}**`);
      await channel.send({ embeds: [embedWin] });
      giveaways.delete(msg.id);
    }, durationMs);

    message.channel.send(`✅ Giveaway lancé dans ${channel}.`).then(m => setTimeout(() => m.delete(), 5000));
    const logEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('🎁 Giveaway lancé')
      .setDescription(`${member.user.tag} a lancé un giveaway : ${title}`)
      .setTimestamp();
    await sendLog(message.guild, 'moderation', null, logEmbed);
  }

  // ========== MESSAGE ==========
  if (command === 'message') {
    const text = args.slice(1).join(' ').replace(/\*n/g, '\n');
    const channel = message.mentions.channels.first();
    if (!channel || !text) return message.channel.send('❌ Usage: !message #salon "texte avec *n pour saut de ligne"').then(m => setTimeout(() => m.delete(), 10000));
    await channel.send(text);
    await message.delete().catch(() => {});
  }

  // ========== EMBED ==========
  if (command === 'embed') {
    const title = args[1] || ' ';
    const description = args[2] || ' ';
    const color = args[3] || EMBED_COLOR;
    const image = args[4] || null;
    const footer = args.slice(5).join(' ') || null;
    const channel = message.mentions.channels.first();
    if (!channel) return message.channel.send('❌ Salon invalide.').then(m => setTimeout(() => m.delete(), 10000));
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description.replace(/\*n/g, '\n'));
    if (image) embed.setImage(image);
    if (footer) embed.setFooter({ text: footer });
    await channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});
  }
});

// ========== INITIALISATION ==========
client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  client.user.setActivity("j'protege tout le monde", { type: ActivityType.Playing });

  // Initialisation du cache d'invites
  client.inviteCache = new Map();
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      const cache = {};
      for (const [code, invite] of invites) {
        cache[code] = invite.uses;
      }
      client.inviteCache.set(guild.id, cache);
    } catch (e) { /* ignore */ }
  }
});

// ========== CONNEXION ==========
client.login(TOKEN);
