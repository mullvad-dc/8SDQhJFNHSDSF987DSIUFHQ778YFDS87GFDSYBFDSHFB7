// ============================================
// open.js - Gestion des ouvertures de salons
// ============================================

const { ChannelType } = require('discord.js');

// ========== CONFIGURATION ==========

// Salons déjà visibles par @everyone (NE JAMAIS SUPPRIMER CES 3 SALONS !)
const EVERYONE_CHANNELS = [
  '1522766499142565898',
  '1522766867444531280',
  '1522766536086130788'
];

// ========== CONFIGURATION DE TEST (ACTIVE) ==========
// ⚠️ Pour l'instant, seule cette catégorie s'ouvrira le 05/07/2026 à 23h
const OPEN_CATEGORIES = [
  '1523429979315245167'   // 🧪 Catégorie de test (SEULEMENT celle-ci pour l'instant)
];

// ========== CONFIGURATION RÉELLE (DÉSACTIVÉE pour l'instant) ==========
// ⚠️ Quand vous voudrez ouvrir toutes les catégories le 19/07/2026 :
// 1. Commentez la configuration de test (ci-dessus)
// 2. Décommentez la configuration réelle (ci-dessous)
// 3. Changez la date dans scheduleOpening (voir ligne ~85)
//
// const OPEN_CATEGORIES = [
//   '1522761111420666096',
//   '1522762054660915260',
//   '1522762306461630494',
//   '1522762568547045508',
//   '1522768228848369804',
//   '1522762856372895764',
//   '1522764524476960868'
// ];

// ========== FONCTIONS ==========

/**
 * Configure les salons @everyone (les 3 salons déjà ouverts)
 * Ne supprime JAMAIS les salons, seulement vérifie et ouvre si besoin
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
 * Ouvre les catégories et leurs salons
 * Ne supprime JAMAIS de salons
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
  // ⚠️ DATE DE TEST : 05/07/2026 à 23h (Paris) = 21h UTC
  // Quand vous passerez en production, changez pour : 19/07/2026 à 20h
  const targetDate = new Date(Date.UTC(2026, 6, 5, 21, 0, 0));
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
  
  console.log(`⏰ [TEST] Ouverture programmée dans ${days}j ${hours}h ${minutes}min (${new Date(targetDate).toLocaleString('fr-FR')})`);
  console.log(`📌 [TEST] Catégorie à ouvrir : ${OPEN_CATEGORIES.join(', ')}`);
  console.log(`📌 Les 3 salons @everyone sont déjà ouverts et ne seront PAS supprimés.`);
  
  return new Promise((resolve) => {
    setTimeout(async () => {
      console.log(`🔓 [TEST] Déclenchement de l'ouverture...`);
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
  getDelayUntil
};
