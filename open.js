// ============================================
// open.js - Gestion des ouvertures de salons
// ============================================

const { ChannelType } = require('discord.js');

// ========== CONFIGURATION ==========

// Salons déjà visibles par @everyone (seront supprimés après l'ouverture)
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

// Éléments à supprimer après l'ouverture
const TO_DELETE = [
  '1522769330201301135',   // Catégorie
  '1522766499142565898',   // Salon 1
  '1522766867444531280',   // Salon 2
  '1522766536086130788'    // Salon 3
];

// ========== FONCTIONS ==========

/**
 * Configure les salons @everyone
 */
async function setupEveryoneChannels(guild) {
  const everyoneRole = guild.roles.everyone;
  const results = [];
  
  console.log('🔍 Vérification des 3 salons @everyone...');
  
  for (const channelId of EVERYONE_CHANNELS) {
    try {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        await channel.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: true
        });
        results.push({ id: channelId, name: channel.name, success: true });
        console.log(`✅ Salon ${channel.name} (${channelId}) est ouvert à @everyone`);
      } else {
        results.push({ id: channelId, success: false, error: 'Salon non trouvé' });
        console.log(`❌ Salon ${channelId} non trouvé`);
      }
    } catch (e) {
      results.push({ id: channelId, success: false, error: e.message });
      console.error(`❌ Erreur pour le salon ${channelId}:`, e.message);
    }
  }
  
  console.log(`📊 ${results.filter(r => r.success).length}/3 salons @everyone sont ouverts`);
  return results;
}

/**
 * Supprime les anciens salons et la catégorie
 */
async function deleteOldChannels(guild) {
  const results = [];
  
  console.log('🗑️ Suppression des anciens salons/catégorie...');
  
  for (const id of TO_DELETE) {
    try {
      const channel = guild.channels.cache.get(id);
      if (channel) {
        const name = channel.name;
        await channel.delete('Suppression automatique lors de l\'ouverture des catégories');
        results.push({ id, name, success: true });
        console.log(`✅ ${name} (${id}) supprimé`);
      } else {
        results.push({ id, success: false, error: 'Non trouvé' });
        console.log(`❌ ${id} non trouvé`);
      }
    } catch (e) {
      results.push({ id, success: false, error: e.message });
      console.error(`❌ Erreur pour ${id}:`, e.message);
    }
  }
  
  console.log(`📊 ${results.filter(r => r.success).length}/${TO_DELETE.length} éléments supprimés`);
  return results;
}

/**
 * Ouvre les catégories et leurs salons, puis supprime les anciens
 */
async function openCategories(guild) {
  const everyoneRole = guild.roles.everyone;
  const openedChannels = [];
  const errors = [];
  
  console.log('🔓 Ouverture des catégories...');
  
  for (const categoryId of OPEN_CATEGORIES) {
    try {
      const category = guild.channels.cache.get(categoryId);
      if (category && category.type === ChannelType.GuildCategory) {
        await category.permissionOverwrites.edit(everyoneRole, {
          ViewChannel: true
        });
        openedChannels.push(category.name);
        console.log(`✅ Catégorie ${category.name} ouverte à @everyone`);
        
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
  
  // ========== SUPPRESSION DES ANCIENS SALONS ==========
  if (openedChannels.length > 0) {
    await deleteOldChannels(guild);
  }
  
  console.log(`📊 ${openedChannels.length} catégories ouvertes`);
  return { opened: openedChannels, errors };
}

/**
 * Calcule le délai jusqu'à la date cible
 */
function getDelayUntil(targetDate) {
  const now = new Date();
  return targetDate.getTime() - now.getTime();
}

/**
 * Programme l'ouverture des catégories
 */
function scheduleOpening(guild, sendLog) {
  // 📅 19 juillet 2026 à 20h (Paris) = 18h UTC
  const targetDate = new Date(Date.UTC(2026, 6, 19, 18, 0, 0));
  const delay = getDelayUntil(targetDate);
  
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
  
  console.log(`⏰ Ouverture programmée dans ${days}j ${hours}h ${minutes}min (${new Date(targetDate).toLocaleString('fr-FR')})`);
  console.log(`📌 Catégories à ouvrir : ${OPEN_CATEGORIES.length} catégories`);
  console.log(`📌 Éléments à supprimer après ouverture : ${TO_DELETE.length} éléments`);
  
  return new Promise((resolve) => {
    setTimeout(async () => {
      console.log(`🔓 Déclenchement de l'ouverture...`);
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
  TO_DELETE,
  setupEveryoneChannels,
  openCategories,
  scheduleOpening,
  getDelayUntil,
  deleteOldChannels
};
