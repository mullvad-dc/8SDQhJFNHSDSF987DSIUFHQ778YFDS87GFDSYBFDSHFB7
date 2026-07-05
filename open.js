// ============================================
// open.js - Gestion des ouvertures de salons
// ============================================

const { ChannelType } = require('discord.js');

// ========== CONFIGURATION ==========

// Salons déjà visibles par @everyone
const EVERYONE_CHANNELS = [
  '1522766499142565898',
  '1522766867444531280',
  '1522766536086130788'
];

// Catégories à ouvrir le 19/07/2026 à 20h (Paris)
const OPEN_CATEGORIES = [
  '1522761111420666096',
  '1522762054660915260',
  '1522762306461630494',
  '1522762568547045508',
  '1522768228848369804',
  '1522762856372895764',
  '1522764524476960868'
];

// ========== FONCTIONS ==========

/**
 * Configure les salons @everyone
 */
async function setupEveryoneChannels(guild) {
  const everyoneRole = guild.roles.everyone;
  const results = [];
  
  for (const channelId of EVERYONE_CHANNELS) {
    try {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        await channel.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: true
        });
        results.push({ id: channelId, name: channel.name, success: true });
        console.log(`✅ Salon ${channel.name} ouvert à @everyone`);
      } else {
        results.push({ id: channelId, success: false, error: 'Salon non trouvé' });
        console.log(`❌ Salon ${channelId} non trouvé`);
      }
    } catch (e) {
      results.push({ id: channelId, success: false, error: e.message });
      console.error(`❌ Erreur pour le salon ${channelId}:`, e.message);
    }
  }
  
  return results;
}

/**
 * Ouvre les catégories et leurs salons
 */
async function openCategories(guild) {
  const everyoneRole = guild.roles.everyone;
  const openedChannels = [];
  const errors = [];
  
  for (const categoryId of OPEN_CATEGORIES) {
    try {
      const category = guild.channels.cache.get(categoryId);
      if (category && category.type === ChannelType.GuildCategory) {
        await category.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: true
        });
        openedChannels.push(category.name);
        console.log(`✅ Catégorie ${category.name} ouverte à @everyone`);
        
        // Ouvrir tous les salons dans la catégorie
        const children = guild.channels.cache.filter(ch => ch.parentId === categoryId);
        for (const [, child] of children) {
          await child.permissionOverwrites.edit(everyoneRole, {
            ViewChannel: true
          });
          console.log(`  ✅ Salon ${child.name} ouvert`);
        }
      } else {
        errors.push({ id: categoryId, error: 'Catégorie non trouvée' });
        console.log(`❌ Catégorie ${categoryId} non trouvée`);
      }
    } catch (e) {
      errors.push({ id: categoryId, error: e.message });
      console.error(`❌ Erreur pour la catégorie ${categoryId}:`, e.message);
    }
  }
  
  return { opened: openedChannels, errors };
}

/**
 * Calcule le délai jusqu'au 19/07/2026 à 20h (Paris)
 */
function getOpeningDelay() {
  // 19 juillet 2026 à 20h (Paris) = 18h UTC (heure d'été, UTC+2)
  const targetDate = new Date(Date.UTC(2026, 6, 19, 18, 0, 0));
  const now = new Date();
  return targetDate.getTime() - now.getTime();
}

/**
 * Programme l'ouverture des catégories
 */
function scheduleOpening(guild, sendLog) {
  const delay = getOpeningDelay();
  
  if (delay <= 0) {
    console.log('⚠️ La date d\'ouverture est déjà passée, ouverture immédiate...');
    return openCategories(guild).then(result => {
      if (result.opened.length > 0 && sendLog) {
        sendLog(guild, result);
      }
      return result;
    });
  }
  
  const days = Math.floor(delay / (1000 * 60 * 60 * 24));
  const hours = Math.floor((delay % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
  
  console.log(`⏰ Ouverture programmée dans ${days}j ${hours}h ${minutes}min (${new Date(Date.now() + delay).toLocaleString('fr-FR')})`);
  
  return new Promise((resolve) => {
    setTimeout(async () => {
      const result = await openCategories(guild);
      if (result.opened.length > 0 && sendLog) {
        sendLog(guild, result);
      }
      resolve(result);
    }, delay);
  });
}

// ========== EXPORT ==========
module.exports = {
  EVERYONE_CHANNELS,
  OPEN_CATEGORIES,
  setupEveryoneChannels,
  openCategories,
  scheduleOpening,
  getOpeningDelay
};
