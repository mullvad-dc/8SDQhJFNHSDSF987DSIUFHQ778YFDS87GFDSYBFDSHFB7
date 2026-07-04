client.on('interactionCreate', async interaction => {
  // ========== BOUTONS ==========
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // --- Bouton pour ouvrir le modal MESSAGE ---
    if (customId === 'open_message_modal') {
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

    // --- Bouton pour ouvrir le modal EMBED ---
    if (customId === 'open_embed_modal') {
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

    // --- Gestion des boutons de tickets (fermer, supprimer, transcript) ---
    if (customId.startsWith('ticket_close_')) {
      const channelId = customId.replace('ticket_close_', '');
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

    if (customId.startsWith('ticket_delete_')) {
      const channelId = customId.replace('ticket_delete_', '');
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

    if (customId.startsWith('ticket_transcript_')) {
      const channelId = customId.replace('ticket_transcript_', '');
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
      const salonId = interaction.fields.getTextInputValue('salon') || interaction.channelId;
      const texte = interaction.fields.getTextInputValue('texte');

      const channel = interaction.guild.channels.cache.get(salonId);
      if (!channel) {
        return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
      }

      await channel.send(texte);
      await interaction.reply({ content: `✅ Message envoyé dans ${channel}`, ephemeral: true });

      const logEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('📝 Message envoyé')
        .setDescription(`Par ${interaction.user.tag}\nSalon : ${channel.name}`)
        .addFields({ name: 'Contenu', value: texte.substring(0, 100) + (texte.length > 100 ? '...' : '') })
        .setTimestamp();
      await sendLog(interaction.guild, 'messages', null, logEmbed);
      return;
    }

    if (interaction.customId === 'embedModal') {
      const salonId = interaction.fields.getTextInputValue('salon') || interaction.channelId;
      const titre = interaction.fields.getTextInputValue('titre') || ' ';
      const description = interaction.fields.getTextInputValue('description') || ' ';
      let couleur = interaction.fields.getTextInputValue('couleur') || EMBED_COLOR;
      if (couleur.startsWith('#')) couleur = couleur.slice(1);
      const image = interaction.fields.getTextInputValue('image') || null;
      const footer = interaction.fields.getTextInputValue('footer') || null;

      const channel = interaction.guild.channels.cache.get(salonId);
      if (!channel) {
        return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(couleur)
        .setTitle(titre)
        .setDescription(description.replace(/\/n/g, '\n'));
      if (image) embed.setImage(image);
      if (footer) embed.setFooter({ text: footer });

      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: `✅ Embed envoyé dans ${channel}`, ephemeral: true });

      const logEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🎨 Embed envoyé')
        .setDescription(`Par ${interaction.user.tag}\nSalon : ${channel.name}`)
        .setTimestamp();
      await sendLog(interaction.guild, 'messages', null, logEmbed);
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
