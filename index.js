const { Client, GatewayIntentBits, EmbedBuilder, Collection, PermissionsBitField, ActivityType, ChannelType, AuditLogEvent, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
const EMBED_COLOR = '#f1c40f';

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
  raids: '1523020721100554312'
};

const ROLES = {
  muteUnmute: ['1522759758338064384', '1522756598236319836'],
  ticket: '1522759354774716556',
  fullPerms: ['1522757429501362307', '1522757708946604083', '1522757813074530416']
};

const HELP_ROLES = [
  '1522760141403848724',
  '1522759758338064384',
  '1522759354774716556',
  '1522759455584948304',
  '1522757429501362307',
  '1522757708946604083',
  '1522757813074530416'
];

const INVITE_CHANNEL_ID = '1522761566242607114';
const STATUT_CHANNEL_ID = '1522762774676115687';
const ROLE_STATUT_ID = '1522755616958054430';
const TICKET_CATEGORY_ID = '1522768228848369804';

const COOLDOWNS = {
  bl: 15 * 60 * 1000,
  timeout: 10 * 60 * 1000,
  kick: 15 * 60 * 1000,
  everyone: 2 * 60 * 1000
};

const antiLinkEnabled = new Map();
const cooldowns = new Map();
const everyoneCooldown = new Map();
const ticketConfigs = new Map();
const giveaways = new Map();
const ticketMessages = new Map();

const DEFAULT_TICKET_CONFIG = {
  title: 'TICKET',
  description: 'Ouvrez le menu déroulant ci-dessous pour ouvrir un ticket',
  image: null,
  color: EMBED_COLOR,
  footer: '🔱 Sysnet',
  options: ['👑 Rankup', '❓ Question', '🧶 Autre...']
};

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
    for (const id of ROLES.muteUnmute) {
      if (roles.includes(id)) return true;
    }
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

function hasHelpPerm(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const roles = member.roles.cache.map(r => r.id);
  return roles.some(r => HELP_ROLES.includes(r));
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

function hasTicketAccess(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const roles = member.roles.cache.map(r => r.id);
  for (const id of ROLES.fullPerms) {
    if (roles.includes(id)) return true;
  }
  if (roles.includes(ROLES.ticket)) return true;
  return false;
}

let joinCount = 0;
let joinTimer = null;

// ========== ÉVÉNEMENTS ==========
client.on('guildMemberAdd', async member => {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📥 Arrivée')
    .setDescription(`${member.user.tag} (${member.id}) a rejoint le serveur.`)
    .setTimestamp();
  await sendLog(member.guild, 'joinleave', null, embed);

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

// ========== ANTILINK + ANTI-EVERYONE + STATUT ==========
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (message.channel.parentId === TICKET_CATEGORY_ID) {
    if (!ticketMessages.has(message.channel.id)) {
      ticketMessages.set(message.channel.id, []);
    }
    const msgs = ticketMessages.get(message.channel.id);
    msgs.push({
      author: message.author.tag,
      authorId: message.author.id,
      content: message.content,
      timestamp: message.createdTimestamp,
      attachments: message.attachments.map(a => a.url)
    });
    if (msgs.length > 1000) msgs.shift();
  }

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

  if (message.channel.id === STATUT_CHANNEL_ID && message.mentions.has(client.user.id)) {
    const member = message.member;
    const presence = member.presence;
    let hasLink = false;
    if (presence) {
      const activity = presence.activities.find(a => a.type === ActivityType.Custom);
      if (activity && activity.state) {
        const statut = activity.state;
        const patterns = [
          /https:\/\/discord\.gg\/teadMR4zgG/,
          /discord\.gg\/teadMR4zgG/,
          /\.gg\/teadMR4zgG/,
          /\/teadMR4zgG/
        ];
        hasLink = patterns.some(regex => regex.test(statut));
      }
    }
    const role = message.guild.roles.cache.get(ROLE_STATUT_ID);
    if (role) {
      if (hasLink && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        await message.channel.send(`✅ ${member.user}, vous avez reçu le rôle **${role.name}** !`);
        const logEmbed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('✅ Rôle attribué via ping')
          .setDescription(`${member.user.tag} a reçu le rôle ${role.name} en pinguant le bot.`)
          .setTimestamp();
        await sendLog(message.guild, 'autorank', null, logEmbed);
      } else if (hasLink && member.roles.cache.has(role.id)) {
        await message.channel.send(`✅ ${member.user}, vous avez déjà le rôle **${role.name}**.`);
      } else {
        await message.channel.send(`${member.user}, vous devez mettre le lien **discord.gg/teadMR4zgG** (ou .gg/teadMR4zgG, /teadMR4zgG) dans votre statut personnalisé, puis pingez-moi à nouveau.`);
      }
    }
  }
});

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

  if (command !== 'help') {
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('📝 Commande exécutée')
      .setDescription(`${member.user.tag} a utilisé \`!${command}\``)
      .setTimestamp();
    await sendLog(message.guild, 'commandes', null, embed);
  }

  if (command === 'help') {
    if (!hasHelpPerm(member)) {
      return message.channel.send('❌ Vous n\'avez pas la permission de voir l\'aide.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('🛡️ Sainte protect - Aide')
      .setDescription(`
**🔐 MODÉRATION :**
\`!bl <user> <raison>\` - Bannir
\`!unbl <user>\` - Débannir
\`!mute <user> <durée>\` - Timeout
\`!unmute <user>\` - Retirer timeout
\`!kick <user> <raison>\` - Kick

**🛡️ SÉCURITÉ :**
\`!anti-link\` - Active/désactive l'anti-link (admin)
\`!lock\` - Verrouille tous les salons (admin)
\`!unlock\` - Déverrouille (admin)

**🧹 UTILITAIRES :**
\`!clear <n>\` - Supprime n messages (admin)
\`!clean\` - Supprime tous les messages (admin)
\`!setstatus <playing|streaming> <texte>\` - Change le statut (admin)

**🎫 TICKETS :**
\`!ticket config set <champ> <valeur>\` - Configurer les tickets (admin)
\`!ticket send\` - Envoyer le message de tickets (admin)

**🎁 GIVEAWAYS :**
\`!giveaway #salon <durée> <nb> <titre> | <description>\` - Lancer un giveaway (admin)

**📝 MESSAGES :**
\`!message\` - Ouvre un formulaire pour envoyer un message (admin)
\`!embed\` - Ouvre un formulaire pour envoyer un embed (admin)

**🔄 SYSTÈMES ACTIFS :**
• Anti-bot, Anti-channel, Anti-everyone
• Système d'invitations
• Rôle via statut (automatique + ping du bot)
      `)
      .setFooter({ text: '🔱 Sysnet • 19/07/2026' });
    return message.channel.send({ embeds: [embed] });
  }

  if (['anti-link', 'lock', 'unlock', 'clear', 'clean', 'setstatus', 'giveaway', 'ticket', 'message', 'embed'].includes(command)) {
    if (!hasAdminPerm(member)) {
      return message.channel.send('❌ Commande réservée aux administrateurs.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
  }

  // ========== MESSAGE (envoie un bouton qui ouvre le modal) ==========
  if (command === 'message') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('open_message_modal')
          .setLabel('✉️ Ouvrir le formulaire')
          .setStyle(ButtonStyle.Primary)
      );

    await message.channel.send({
      content: '📝 Cliquez sur le bouton ci-dessous pour ouvrir le formulaire d\'envoi de message.',
      components: [row]
    });
    await message.delete().catch(() => {});
    return;
  }

  // ========== EMBED (envoie un bouton qui ouvre le modal) ==========
  if (command === 'embed') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('open_embed_modal')
          .setLabel('🎨 Ouvrir le formulaire')
          .setStyle(ButtonStyle.Primary)
      );

    await message.channel.send({
      content: '🎨 Cliquez sur le bouton ci-dessous pour ouvrir le formulaire de création d\'embed.',
      components: [row]
    });
    await message.delete().catch(() => {});
    return;
  }

  // ========== BL ==========
  if (command === 'bl') {
    if (!hasPermission(member, command)) {
      return message.channel.send('❌ Vous n\'avez pas la permission.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
    let target = message.mentions.users.first();
    if (!target) {
      const userId = args[0];
      if (userId && /^\d+$/.test(userId)) {
        target = client.users.cache.get(userId);
        if (!target) {
          try {
            target = await client.users.fetch(userId);
          } catch (e) { /* ignore */ }
        }
      }
    }
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

  if (command === 'unbl') {
    if (!hasPermission(member, command)) {
      return message.channel.send('❌ Vous n\'avez pas la permission.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
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

  if (command === 'kick') {
    if (!hasPermission(member, command)) {
      return message.channel.send('❌ Vous n\'avez pas la permission.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
    let target = message.mentions.users.first();
    if (!target) {
      const userId = args[0];
      if (userId && /^\d+$/.test(userId)) {
        target = client.users.cache.get(userId);
        if (!target) {
          try {
            target = await client.users.fetch(userId);
          } catch (e) { /* ignore */ }
        }
      }
    }
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

  if (command === 'mute') {
    if (!hasPermission(member, command)) {
      return message.channel.send('❌ Vous n\'avez pas la permission.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
    let target = message.mentions.users.first();
    if (!target) {
      const userId = args[0];
      if (userId && /^\d+$/.test(userId)) {
        target = client.users.cache.get(userId);
        if (!target) {
          try {
            target = await client.users.fetch(userId);
          } catch (e) { /* ignore */ }
        }
      }
    }
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

  if (command === 'unmute') {
    if (!hasPermission(member, command)) {
      return message.channel.send('❌ Vous n\'avez pas la permission.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
    let target = message.mentions.users.first();
    if (!target) {
      const userId = args[0];
      if (userId && /^\d+$/.test(userId)) {
        target = client.users.cache.get(userId);
        if (!target) {
          try {
            target = await client.users.fetch(userId);
          } catch (e) { /* ignore */ }
        }
      }
    }
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

  if (command === 'unlock') {
    const channels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    let count = 0;
    for (const [, ch] of channels) {
      try {
        await ch.permissionOverwrites.edit(message.guild.id, { SendMessages
