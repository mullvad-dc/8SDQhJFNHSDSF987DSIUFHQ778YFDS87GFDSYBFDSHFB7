// ========== HELP ==========
if (command === 'help') {
  if (!hasHelpPerm(member)) {
    return message.channel.send('❌ Vous n\'avez pas la permission de voir l\'aide.')
      .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
  }
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
