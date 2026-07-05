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
\`!anti-link\` - Active/désactive l'anti-link
\`!lock\` - Verrouille tous les salons
\`!unlock\` - Déverrouille

**🧹 UTILITAIRES :**
\`!clear <n>\` - Supprime n messages
\`!clean\` - Supprime tous les messages
\`!setstatus <playing|streaming> <texte>\` - Change le statut

**🎫 TICKETS :**
\`!ticket config set <champ> <valeur>\` - Configurer les tickets
\`!ticket send\` - Envoyer le message de tickets

**🎁 GIVEAWAYS :**
\`!giveaway #salon <durée> <nb> <titre> | <description>\` - Lancer

**📝 MESSAGES :**
\`!message\` - Ouvre un formulaire pour envoyer un message
\`!embed\` - Ouvre un formulaire pour envoyer un embed
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

  if (command === 'message') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('open_message_modal')
          .setLabel('✉️ Ouvrir le formulaire')
          .setStyle(ButtonStyle.Primary)
      );

    await message.channel.send({
      content: '📝 Cliquez sur le bouton ci-dessous pour ouvrir le formulaire.',
      components: [row]
    });
    await message.delete().catch(() => {});
    return;
  }

  if (command === 'embed') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('open_embed_modal')
          .setLabel('🎨 Ouvrir le formulaire')
          .setStyle(ButtonStyle.Primary)
      );

    await message.channel.send({
      content: '🎨 Cliquez sur le bouton ci-dessous pour ouvrir le formulaire.',
      components: [row]
    });
    await message.delete().catch(() => {});
    return;
  }

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
          try { target = await client.users.fetch(userId); } catch (e) {}
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
          try { target = await client.users.fetch(userId); } catch (e) {}
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
      } catch (e) {}
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
          try { target = await client.users.fetch(userId); } catch (e) {}
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
          try { target = await client.users.fetch(userId); } catch (e) {}
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
      } catch (e) {}
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
        await ch.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
        count++;
      } catch (e) {}
    }
    message.channel.send(`🔓 ${count} salons déverrouillés.`).then(m => setTimeout(() => m.delete(), 5000));
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('🔓 Unlock global')
      .setDescription(`Tous les salons ont été déverrouillés par ${member.user.tag}`)
      .setTimestamp();
    await sendLog(message.guild, 'systeme', null, embed);
  }

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

  if (command === 'ticket' && args[0] === 'config' && args[1] === 'set') {
    if (!hasAdminPerm(member)) {
      return message.channel.send('❌ Commande réservée aux administrateurs.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
    const field = args[2];
    const value = args.slice(3).join(' ');
    if (!field || !value) return message.channel.send('❌ Usage: !ticket config set <titre|description|image|couleur|footer|options> <valeur>').then(m => setTimeout(() => m.delete(), 10000));

    const config = ticketConfigs.get(message.guild.id) || { ...DEFAULT_TICKET_CONFIG };
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

  if (command === 'ticket' && args[0] === 'send') {
    if (!hasAdminPerm(member)) {
      return message.channel.send('❌ Commande réservée aux administrateurs.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }

    const config = ticketConfigs.get(message.guild.id) || { ...DEFAULT_TICKET_CONFIG };

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_menu')
          .setPlaceholder('Choisissez une option')
          .addOptions(
            config.options.map(opt => ({
              label: opt,
              value: opt,
              description: `Ouvrir un ticket pour ${opt}`
            }))
          )
      );

    const embed = new EmbedBuilder()
      .setColor(config.color)
      .setTitle(config.title)
      .setDescription(config.description)
      .setFooter({ text: config.footer });

    if (config.image) embed.setImage(config.image);

    await message.channel.send({ embeds: [embed], components: [row] });
    message.channel.send('✅ Message de tickets envoyé !').then(m => setTimeout(() => m.delete(), 5000));
    await message.delete().catch(() => {});

    const logEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('🎫 Message de tickets envoyé')
      .setDescription(`${member.user.tag} a envoyé le message de tickets dans ${message.channel}`)
      .setTimestamp();
    await sendLog(message.guild, 'tickets', null, logEmbed);
  }

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
});

// ========== INTERACTIONS ==========
client.on('interactionCreate', async interaction => {
  // ========== BOUTONS POUR MODALS ==========
  if (interaction.isButton()) {
    if (interaction.customId === 'open_message_modal') {
      const modal = new ModalBuilder()
        .setCustomId('messageModal')
        .setTitle('✉️ Envoyer un message');

      const salonInput = new TextInputBuilder()
        .setCustomId('salon')
        .setLabel('📌 ID du salon (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Laissez vide pour envoyer ici')
        .setRequired(false);

      const textInput = new TextInputBuilder()
        .setCustomId('texte')
        .setLabel('📝 Contenu du message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Écrivez votre message ici...')
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(salonInput);
      const row2 = new ActionRowBuilder().addComponents(textInput);
      modal.addComponents(row1, row2);

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === 'open_embed_modal') {
      const modal = new ModalBuilder()
        .setCustomId('embedModal')
        .setTitle('🎨 Créer un embed');

      const salonInput = new TextInputBuilder()
        .setCustomId('salon')
        .setLabel('📌 ID du salon (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Laissez vide pour envoyer ici')
        .setRequired(false);

      const titreInput = new TextInputBuilder()
        .setCustomId('titre')
        .setLabel('📌 Titre')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const descInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('📝 Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Utilisez /n pour les sauts de ligne')
        .setRequired(false);

      const couleurInput = new TextInputBuilder()
        .setCustomId('couleur')
        .setLabel('🎨 Couleur (hex, ex: f1c40f)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('f1c40f')
        .setRequired(false);

      const imageInput = new TextInputBuilder()
        .setCustomId('image')
        .setLabel('🖼️ URL de l\'image (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const footerInput = new TextInputBuilder()
        .setCustomId('footer')
        .setLabel('📌 Footer (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(salonInput);
      const row2 = new ActionRowBuilder().addComponents(titreInput);
      const row3 = new ActionRowBuilder().addComponents(descInput);
      const row4 = new ActionRowBuilder().addComponents(couleurInput);
      const row5 = new ActionRowBuilder().addComponents(imageInput);
      const row6 = new ActionRowBuilder().addComponents(footerInput);

      modal.addComponents(row1, row2, row3, row4, row5, row6);

      await interaction.showModal(modal);
      return;
    }

    // ========== BOUTONS TICKETS ==========
    if (interaction.customId.startsWith('ticket_close_')) {
      const channelId = interaction.customId.replace('ticket_close_', '');
      const channel = interaction.channel;
      
      if (channel.id !== channelId) {
        return interaction.reply({ content: '❌ Utilisez ce bouton dans le bon salon.', ephemeral: true });
      }

      if (!hasTicketAccess(interaction.member)) {
        return interaction.reply({ content: '❌ Vous n\'avez pas la permission de fermer ce ticket.', ephemeral: true });
      }

      await interaction.deferReply();

      const transcript = await generateTranscript(channel);
      
      const logChannel = getLogChannel(interaction.guild, 'tickets');
      if (logChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('📄 Transcript du ticket')
          .setDescription(`Ticket fermé par ${interaction.member.user.tag}\nSalon : ${channel.name}`)
          .setTimestamp();
        await logChannel.send({
          embeds: [transcriptEmbed],
          files: [{
            attachment: Buffer.from(transcript, 'utf-8'),
            name: `transcript-${channel.name}-${Date.now()}.html`
          }]
        });
      }

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_delete_${channel.id}`)
            .setLabel('🗑️ Supprimer')
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        content: `🔒 Ticket fermé par ${interaction.member.user.tag}. Cliquez sur "Supprimer" pour supprimer le salon.`,
        components: [row]
      });

      const logEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🔒 Ticket fermé')
        .setDescription(`Ticket ${channel.name} fermé par ${interaction.member.user.tag}`)
        .setTimestamp();
      await sendLog(interaction.guild, 'tickets', null, logEmbed);

      await interaction.editReply({ content: '✅ Ticket fermé. Le transcript a été envoyé dans les logs.', ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith('ticket_delete_')) {
      const channelId = interaction.customId.replace('ticket_delete_', '');
      const channel = interaction.channel;

      if (channel.id !== channelId) {
        return interaction.reply({ content: '❌ Utilisez ce bouton dans le bon salon.', ephemeral: true });
      }

      if (!hasTicketAccess(interaction.member)) {
        return interaction.reply({ content: '❌ Vous n\'avez pas la permission de supprimer ce ticket.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      
      try {
        await channel.delete(`Ticket supprimé par ${interaction.member.user.tag}`);
        await interaction.editReply({ content: '✅ Ticket supprimé.' });
      } catch (e) {
        await interaction.editReply({ content: '❌ Erreur lors de la suppression.' });
      }
      return;
    }

    if (interaction.customId.startsWith('ticket_transcript_')) {
      const channelId = interaction.customId.replace('ticket_transcript_', '');
      const channel = interaction.channel;

      if (channel.id !== channelId) {
        return interaction.reply({ content: '❌ Utilisez ce bouton dans le bon salon.', ephemeral: true });
      }

      if (!hasTicketAccess(interaction.member)) {
        return interaction.reply({ content: '❌ Vous n\'avez pas la permission de générer un transcript.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const transcript = await generateTranscript(channel);
      const logChannel = getLogChannel(interaction.guild, 'tickets');
      if (logChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('📄 Transcript du ticket')
          .setDescription(`Transcript demandé par ${interaction.member.user.tag}\nSalon : ${channel.name}`)
          .setTimestamp();
        await logChannel.send({
          embeds: [transcriptEmbed],
          files: [{
            attachment: Buffer.from(transcript, 'utf-8'),
            name: `transcript-${channel.name}-${Date.now()}.html`
          }]
        });
      }

      await interaction.editReply({ content: '✅ Transcript généré et envoyé dans les logs.' });
      return;
    }
  }

  // ========== MODALS ==========
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'messageModal') {
      await interaction.deferReply({ ephemeral: true });
      
      const salonId = interaction.fields.getTextInputValue('salon')?.trim();
      let texte = interaction.fields.getTextInputValue('texte');
      
      let channel;
      if (salonId && /^\d+$/.test(salonId)) {
        channel = interaction.guild.channels.cache.get(salonId);
        if (!channel) {
          try {
            channel = await interaction.guild.channels.fetch(salonId);
          } catch (e) {
            console.error('Erreur fetch salon:', e);
          }
        }
      } else {
        channel = interaction.channel;
      }
      
      if (!channel) {
        return interaction.editReply({ 
          content: '❌ Salon invalide. Vérifiez l\'ID.', 
          ephemeral: true 
        });
      }

      try {
        // Vérifier la longueur du message
        if (texte.length > 2000) {
          texte = texte.substring(0, 1997) + '...';
        }
        
        await channel.send(texte);
        await interaction.editReply({ content: `✅ Message envoyé dans ${channel}`, ephemeral: true });
        
        const logEmbed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('📝 Message envoyé')
          .setDescription(`Par ${interaction.user.tag}\nSalon : ${channel.name}`)
          .addFields({ name: 'Contenu', value: texte.substring(0, 100) + (texte.length > 100 ? '...' : '') })
          .setTimestamp();
        await sendLog(interaction.guild, 'messages', null, logEmbed);
      } catch (error) {
        console.error('Erreur messageModal:', error);
        await interaction.editReply({ 
          content: `❌ Erreur: ${error.message}`, 
          ephemeral: true 
        });
      }
      return;
    }

    if (interaction.customId === 'embedModal') {
      await interaction.deferReply({ ephemeral: true });
      
      const salonId = interaction.fields.getTextInputValue('salon')?.trim();
      const titre = interaction.fields.getTextInputValue('titre') || ' ';
      let description = interaction.fields.getTextInputValue('description') || ' ';
      let couleur = interaction.fields.getTextInputValue('couleur')?.trim() || EMBED_COLOR;
      if (couleur.startsWith('#')) couleur = couleur.slice(1);
      const image = interaction.fields.getTextInputValue('image')?.trim() || null;
      const footer = interaction.fields.getTextInputValue('footer')?.trim() || null;
      
      let channel;
      if (salonId && /^\d+$/.test(salonId)) {
        channel = interaction.guild.channels.cache.get(salonId);
        if (!channel) {
          try {
            channel = await interaction.guild.channels.fetch(salonId);
          } catch (e) {
            console.error('Erreur fetch salon:', e);
          }
        }
      } else {
        channel = interaction.channel;
      }
      
      if (!channel) {
        return interaction.editReply({ 
          content: '❌ Salon invalide. Vérifiez l\'ID.', 
          ephemeral: true 
        });
      }

      try {
        // Limiter la description à 4000 caractères
        if (description.length > 4000) {
          description = description.substring(0, 3997) + '...';
        }
        
        const embed = new EmbedBuilder()
          .setColor(couleur)
          .setTitle(titre)
          .setDescription(description.replace(/\/n/g, '\n'));
        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });

        await channel.send({ embeds: [embed] });
        await interaction.editReply({ content: `✅ Embed envoyé dans ${channel}`, ephemeral: true });

        const logEmbed = new EmbedBuilder()
          .setColor(EMBED_COLOR)
          .setTitle('🎨 Embed envoyé')
          .setDescription(`Par ${interaction.user.tag}\nSalon : ${channel.name}`)
          .setTimestamp();
        await sendLog(interaction.guild, 'messages', null, logEmbed);
      } catch (error) {
        console.error('Erreur embedModal:', error);
        await interaction.editReply({ 
          content: `❌ Erreur: ${error.message}`, 
          ephemeral: true 
        });
      }
      return;
    }
  }

  // ========== TICKETS (menu déroulant) ==========
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
    const option = interaction.values[0];
    const guild = interaction.guild;
    const member = interaction.member;

    const category = guild.channels.cache.get(TICKET_CATEGORY_ID);
    if (!category) {
      return interaction.reply({ content: '❌ Catégorie de tickets introuvable. Contactez un administrateur.', ephemeral: true });
    }

    const existingTicket = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildText &&
             ch.name === `ticket-${member.user.username.toLowerCase()}` &&
             ch.parentId === TICKET_CATEGORY_ID
    );
    if (existingTicket) {
      return interaction.reply({ content: `❌ Vous avez déjà un ticket ouvert : ${existingTicket}`, ephemeral: true });
    }

    try {
      const ticketChannel = await guild.channels.create({
        name: `ticket-${member.user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: TICKET_CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          },
          ...ROLES.fullPerms.map(roleId => ({
            id: roleId,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          })),
          {
            id: ROLES.ticket,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          }
        ]
      });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_close_${ticketChannel.id}`)
            .setLabel('🔒 Fermer')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`ticket_transcript_${ticketChannel.id}`)
            .setLabel('📄 Transcript')
            .setStyle(ButtonStyle.Secondary)
        );

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🎫 Ticket - ${option}`)
        .setDescription(`Bonjour ${member.user},\nVotre ticket a été ouvert. Un membre du staff va vous prendre en charge.\n\n**Raison :** ${option}`)
        .setFooter({ text: '🔱 Sysnet • 19/07/2026' });

      await ticketChannel.send({
        content: `<@${member.id}> ${ROLES.fullPerms.map(id => `<@&${id}>`).join(' ')} <@&${ROLES.ticket}>`,
        embeds: [embed],
        components: [row]
      });

      ticketMessages.set(ticketChannel.id, []);

      const logEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🎫 Ticket ouvert')
        .setDescription(`${member.user.tag} a ouvert un ticket : ${option}`)
        .addFields({ name: 'Salon', value: ticketChannel.name })
        .setTimestamp();
      await sendLog(guild, 'tickets', null, logEmbed);

      await interaction.reply({ content: `✅ Ticket ouvert : ${ticketChannel}`, ephemeral: true });

    } catch (e) {
      console.error(e);
      await interaction.reply({ content: '❌ Erreur lors de la création du ticket.', ephemeral: true });
    }
  }
});

// ========== GÉNÉRATION DE TRANSCRIPT ==========
async function generateTranscript(channel) {
  const messages = ticketMessages.get(channel.id) || [];
  
  try {
    const fetched = await channel.messages.fetch({ limit: 100 });
    for (const [, msg] of fetched) {
      if (!msg.author.bot) {
        const existing = messages.find(m => m.timestamp === msg.createdTimestamp && m.content === msg.content);
        if (!existing) {
          messages.push({
            author: msg.author.tag,
            authorId: msg.author.id,
            content: msg.content,
            timestamp: msg.createdTimestamp,
            attachments: msg.attachments.map(a => a.url)
          });
        }
      }
    }
  } catch (e) { /* ignore */ }

  messages.sort((a, b) => a.timestamp - b.timestamp);

  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Transcript - ${channel.name}</title>
  <style>
    body { background-color: #36393f; color: #dcddde; font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
    .message { display: flex; margin-bottom: 15px; padding: 10px; background-color: #2f3136; border-radius: 8px; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background-color: #5865f2; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; margin-right: 12px; flex-shrink: 0; }
    .content { flex: 1; }
    .header { display: flex; align-items: baseline; margin-bottom: 4px; }
    .author { font-weight: bold; color: #ffffff; margin-right: 8px; }
    .timestamp { font-size: 0.75rem; color: #72767d; }
    .text { word-wrap: break-word; }
    .attachment { color: #00aff4; text-decoration: none; display: block; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #40444b; color: #72767d; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1 style="text-align:center;margin-bottom:30px;">📄 Transcript - ${channel.name}</h1>
  `;

  for (const msg of messages) {
    const date = new Date(msg.timestamp);
    const time = date.toLocaleString('fr-FR');
    const initial = msg.author.charAt(0).toUpperCase();
    const avatarColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    
    html += `
  <div class="message">
    <div class="avatar" style="background-color:${avatarColor};">${initial}</div>
    <div class="content">
      <div class="header">
        <span class="author">${escapeHtml(msg.author)}</span>
        <span class="timestamp">${time}</span>
      </div>
      <div class="text">${escapeHtml(msg.content)}</div>
      ${msg.attachments && msg.attachments.length > 0 ? msg.attachments.map(a => `<a href="${a}" class="attachment">📎 ${a}</a>`).join('') : ''}
    </div>
  </div>
    `;
  }

  html += `
  <div class="footer">🔱 Sysnet • ${new Date().toLocaleString('fr-FR')}</div>
</body>
</html>
  `;

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  client.user.setActivity("j'protege tout le monde", { type: ActivityType.Playing });

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

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🟢 Bot Discord en ligne !');
});

app.listen(port, () => {
  console.log(`✅ Serveur HTTP sur le port ${port}`);
});

client.login(TOKEN);
