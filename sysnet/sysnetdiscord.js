const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, ChannelType, PermissionsBitField, ActivityType } = require('discord.js');
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
const TOKEN = process.env.SYSNET_TOKEN;

// IDs des salons (fournis par vous)
const INVITE_CHANNEL_ID = '1522761566242607114';
const STATUT_CHANNEL_ID = '1522762774676115687';
const ROLE_STATUT_ID = '1522755616958054430';
const TICKET_CATEGORY_ID = '1522768228848369804'; // ⚠️ À REMPLACER par l'ID de la catégorie où les tickets seront créés

// IDs des rôles (permis pour giveaways, etc.)
const ADMIN_ROLE_ID = '1522757813074530416';

// Couleur embed
const EMBED_COLOR = '#f1c40f';

// Mémoire
const ticketConfigs = new Map(); // guildId -> config
const giveaways = new Map(); // messageId -> { endTime, channelId, winners, prize, host }
const statutCache = new Map(); // userId -> lastStatut (pour détecter changement)

// ========== FONCTIONS UTILITAIRES ==========
function getLogChannel(guild, type) {
  // On utilise les mêmes salons de logs que le bot protect (partagés)
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
    bots: '1523020554246951093'
  };
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

function hasAdminPerm(member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return member.roles.cache.has(ADMIN_ROLE_ID);
}

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
      .setTitle('➕ [+] Sysnet - Aide')
      .setDescription(`
**Commandes :**
\`!ticket config set <champ> <valeur>\` - Configurer les tickets (admin)
\`!giveaway #salon <durée> <nb_gagnants> <titre> | <description>\` - Lancer un giveaway (admin/role)
\`!giveaway force <ID_message> <@user>\` - Forcer un gagnant (admin/role)
\`!message #salon "texte avec *n pour saut de ligne"\` - Envoyer un message
\`!embed #salon "titre" "description" "couleur" "image" "footer"\` - Envoyer un embed
\`!setstatus <playing|streaming> <texte>\` - Changer le statut du bot

**Systèmes actifs :**
• Système d'invitations avec log
• Attribution de rôle via statut (vérification automatique)
• Giveaways avec compte à rebours
• Tickets configurables
      `)
      .setFooter({ text: '🔱 Sysnet • 19/07/2026' });
    return message.channel.send({ embeds: [embed] });
  }

  // ========== TICKET CONFIG (version simplifiée) ==========
  if (command === 'ticket' && args[0] === 'config' && args[1] === 'set') {
    if (!hasAdminPerm(member)) return message.channel.send('❌ Admin requis.').then(m => setTimeout(() => m.delete(), 10000));
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
      if (opts.length !== 3) return message.channel.send('❌ Vous devez fournir exactement 3 options séparées par des virgules.').then(m => setTimeout(() => m.delete(), 10000));
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
    if (!hasAdminPerm(member)) {
      return message.channel.send('❌ Commande réservée aux admins.').then(m => setTimeout(() => m.delete(), 10000));
    }
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

    const channelMention = args[0];
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
    const channelMention = args[0];
    const text = args.slice(1).join(' ').replace(/\*n/g, '\n');
    const channel = message.mentions.channels.first();
    if (!channel || !text) return message.channel.send('❌ Usage: !message #salon "texte avec *n pour saut de ligne"').then(m => setTimeout(() => m.delete(), 10000));
    await channel.send(text);
    await message.delete().catch(()=>{});
  }

  // ========== EMBED ==========
  if (command === 'embed') {
    const channelMention = args[0];
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
    await message.delete().catch(()=>{});
  }

  // ========== SETSTATUS ==========
  if (command === 'setstatus') {
    if (!hasAdminPerm(member)) return message.channel.send('❌ Admin requis.').then(m => setTimeout(() => m.delete(), 10000));
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

// ========== SYSTÈME D'INVITATIONS ==========
client.on('guildMemberAdd', async member => {
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

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('📥 Arrivée')
    .setDescription(`${member.user.tag} a rejoint. Invité par ${inviter ? inviter.tag : 'inconnu'}`)
    .setTimestamp();
  await sendLog(member.guild, 'joinleave', null, embed);
});

// ========== RÔLE VIA STATUT (surveillance) ==========
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

// ========== INITIALISATION ==========
client.once('ready', async () => {
  console.log(`✅ [+] Sysnet connecté en tant que ${client.user.tag}`);
  client.user.setActivity("/teadMR4zgG", { type: ActivityType.Streaming, url: 'https://twitch.tv/sysnet' });

  client.inviteCache = new Map();
  for (const guild of client.guilds.cache.values()) {
    const invites = await guild.invites.fetch();
    const cache = {};
    for (const [code, invite] of invites) {
      cache[code] = invite.uses;
    }
    client.inviteCache.set(guild.id, cache);
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
client.login(TOKEN);
