const { Markup } = require('telegraf');
const { registerUser, getUser, incrementDailyStat, getAppSettings, addMessageToTrack, getSupplierByTelegramId } = require('../services/database');
const { t } = require('../services/i18n');
const { safeEdit, cleanupUserChat, clearActiveMediaGroup } = require('../services/utils');
const { isAdmin } = require('./admin');
const { notifyAdmins } = require('../services/notifications');

function setupStartHandler(bot) {

    bot.command('start', async (ctx) => {
        try {
            const user = ctx.from;
            const docId = `${ctx.platform}_${user.id}`;
            const settings = ctx.state?.settings || await getAppSettings();

            try { 
                ctx.deleteMessage().catch(() => {});
                clearActiveMediaGroup(docId); 
                cleanupUserChat(ctx).catch(() => {}); 
            } catch(e) {}

            let referrerId = null;
            const payload = (ctx.message && ctx.message.text) ? ctx.message.text.split(' ')[1] : null;
            if (payload && payload.startsWith('ref_')) {
                referrerId = payload;
                if (payload.includes(`_${user.id}_`)) referrerId = null;
            }

            const { isNew, user: registeredUser } = await registerUser(user, ctx.platform, referrerId);
            ctx.state.user = registeredUser;
            await incrementDailyStat('start_commands');

            // --- NOUVEAU : SYSTÈME D'APPROBATION ---
            // Par défaut, l'accès n'est PLUS restreint (demande utilisateur)
            // On ne restreint QU'EN MODE PRIVÉ explicite.
            let isApproved = true;
            if (settings.private_mode === true || settings.auto_approve_new === false) {
                // Si l'admin a explicitement activé le mode privé ou désactivé l'auto-approbation, on restreint.
                isApproved = registeredUser.is_approved === true || registeredUser.is_livreur === true || (await isAdmin(ctx));
            }

            if (!isApproved) {
                // Alerte Admin - Uniquement si nouveau ou pas encore approuvé une seule fois
                if (isNew) {
                    const adminMsg = `🆕 <b>DEMANDE D'ACCÈS</b>\n\n` +
                        `👤 Client : ${user.first_name}\n` +
                        `🆔 ID : <code>${user.id}</code> (Platform: ${ctx.platform})\n` +
                        `Username : @${user.username || 'Inconnu'}\n\n` +
                        `<i>Cliquez sur le bouton ci-dessous pour lui donner accès au catalogue.</i>`;
                    
                    const adminKeyboard = Markup.inlineKeyboard([
                        [Markup.button.callback('✅ DONNER ACCÈS', `approve_${ctx.platform}_${user.id}`)]
                    ]);

                    await notifyAdmins(bot, adminMsg, { ...adminKeyboard, includeModerators: true }).catch(() => {});
                }

                const restrictedText = `🛑 <b>ACCÈS RESTREINT</b>\n\n` +
                    `Bonjour <b>${user.first_name}</b>,\n\n` +
                    `Pour accéder au bot, vous devez d'abord envoyer un message à l'administrateur.\n` +
                    `Une fois que l'admin aura validé votre accès, vous pourrez commander.\n\n` +
                    `👇 <b>Veuillez cliquer ci-dessous :</b>`;
                
                const b = [];
                if (settings.private_contact_url) {
                    b.push([Markup.button.url('✉️ Telegram : Admin', settings.private_contact_url)]);
                } else {
                    // Fallback if the admin hasn't set their contact URL in the dashboard
                    b.push([Markup.button.callback('✉️ Contacter l\'Admin', 'admin_contact_missing')]);
                }
                
                if (settings.channel_url && settings.channel_url.length > 5) {
                    b.push([Markup.button.url('📢 S’abonner au canal', settings.channel_url)]);
                }
                b.push([Markup.button.callback('🔄 Rafraîchir mon statut', 'refresh_status')]);
                
                const restrictedKeyboard = Markup.inlineKeyboard(b);

                return await safeEdit(ctx, restrictedText, {
                    photo: settings.welcome_photo || null,
                    reply_markup: restrictedKeyboard.reply_markup || restrictedKeyboard
                });
            }

            let welcomeText = '';
            if (isNew) {
                const newMsg = `👤 <b>NOUVEL UTILISATEUR !</b>\n\n` +
                    `Nom : ${user.first_name}\n` +
                    `Username : @${user.username || 'Inconnu'}\n` +
                    `ID : <code>${user.id}</code>\n` +
                    (referrerId ? `🎁 Parrainé par : <code>${referrerId}</code>` : `🔍 Arrivé en direct`);
                notifyAdmins(bot, newMsg, { includeModerators: true }).catch(() => {});
            }

            let hasActive = false;
            if (registeredUser.is_livreur) {
                const { getLivreurOrders } = require('../services/database');
                const activeOrders = await getLivreurOrders(registeredUser.id);
                hasActive = activeOrders.length > 0;

                welcomeText = `${settings.ui_icon_livreur || '🚴'} <b>Bienvenue, ${user.first_name} !</b>\n\n` +
                    `📍 Secteur : <b>${(registeredUser.current_city || 'INCONNU').toUpperCase()}</b>\n` +
                    `🔘 Statut : <b>${registeredUser.is_available ? '✅ DISPONIBLE' : '❌ INDISPONIBLE'}</b>\n\n`;
            } else {
                const paymentLine = settings.payment_modes ? `\n🚨 <b>Paiement en : ${settings.payment_modes}</b>\n` : '';
                const defaultText = settings.msg_welcome_back || `👋 <b>Ravi de vous revoir, {first_name} !</b>`;
                welcomeText = t(ctx, 'msg_welcome_back', defaultText, {
                    first_name: user.first_name,
                    bot_name: settings.bot_name,
                    payment_line: paymentLine
                });
            }
            
            // Lookups
            const [isAdminUser, supplier] = await Promise.all([
                isAdmin(ctx),
                getSupplierByTelegramId(String(ctx.from.id))
            ]);
            
            const isFournisseur = !!(supplier && (supplier.status === 'active' || supplier.is_active));
            const isLivreur = registeredUser.is_livreur;

            const keyboard = isLivreur ? await getLivreurMenuKeyboard(ctx, settings, registeredUser, hasActive, isAdminUser) : await getMainMenuKeyboard(ctx, settings, registeredUser, isFournisseur, isAdminUser);
            
            console.log(`[START] Menu Restored - Sending via SafeEdit.`);

            await safeEdit(ctx, welcomeText, {
                photo: (settings.welcome_photo && settings.welcome_photo.length > 5) ? settings.welcome_photo : null,
                reply_markup: keyboard.reply_markup || keyboard
            });

            await updateMenuButton(ctx, registeredUser, settings);

        } catch (error) {
            console.error('❌ Erreur /start:', error);
        }
    });

    bot.action('admin_contact_missing', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery('L\'administrateur n\'a pas encore configuré son lien de contact dans les réglages.', { show_alert: true }).catch(() => {});
    });

    bot.action('refresh_status', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        const userId = `${ctx.platform}_${ctx.from.id}`;
        const user = await getUser(userId);
        const settings = await getAppSettings();
        
        let isApproved = true;
        if (settings.private_mode === true || settings.auto_approve_new === false) {
            isApproved = user?.is_approved === true || user?.is_livreur === true || (await isAdmin(ctx));
        }

        if (isApproved) {
            ctx.deleteMessage().catch(() => {});
            return showMainMenu(ctx);
        } else {
            return ctx.reply('⏳ Votre accès n\'a pas encore été validé par l\'administrateur. Veuillez patienter.', {
                reply_markup: {
                    inline_keyboard: [[{ text: '🗑 Fermer', callback_data: 'delete_message' }]]
                }
            }).catch(() => {});
        }
    });

    // main_menu for livreurs always goes to livreur dashboard
    bot.action('main_menu', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        const userId = `${ctx.platform}_${ctx.from.id}`;
        const user = await getUser(userId);
        if (user && user.is_livreur) {
            // Livreurs always return to their own space
            const settings = await getAppSettings();
            const { getLivreurOrders } = require('../services/database');
            const activeOrders = await getLivreurOrders(userId);
            const hasActive = activeOrders.length > 0;
            const isAvail = user.is_available;
            const text = `${settings.ui_icon_livreur || '🚴'} <b>Espace Livreur</b>\n\n` +
                `👤 ${user.first_name}\n` +
                `📍 Secteur : <b>${(user.current_city || 'INCONNU').toUpperCase()}</b>\n` +
                `🔘 Statut : <b>${isAvail ? '✅ DISPONIBLE' : '❌ INDISPONIBLE'}</b>`;
            const keyboard = await getLivreurMenuKeyboard(ctx, settings, user, hasActive);
            return await safeEdit(ctx, text, keyboard);
        }
        return showMainMenu(ctx);
    });

    bot.action('client_mode_force', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        return showMainMenu(ctx, true);
    });

    bot.action('user_settings', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        const userId = `${ctx.platform}_${ctx.from.id}`;
        const user = await getUser(userId);
        const backAction = (user && user.is_livreur) ? 'livreur_menu' : 'main_menu';
        
        const points = user.points || 0;
        const balance = (user.wallet_balance || 0).toFixed(2);
        
        const text = `⚙️ <b>RÉGLAGES & PROFIL</b>\n\n` +
            `👤 Nom : <b>${ctx.from.first_name}</b>\n` +
            `🆔 ID : <code>${ctx.from.id}</code>\n\n` +
            `💰 Solde : <b>${balance}€</b>\n` +
            `🎁 Points : <b>${points} pts</b>\n\n` +
            `Que souhaitez-vous modifier ?`;
            
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🎁 Mon Parrainage', 'my_referrals')],
            [Markup.button.callback('📦 Mes Commandes', 'my_orders')],
            [Markup.button.callback('◀️ Retour', backAction)]
        ]);
        return safeEdit(ctx, text, keyboard);
    });

    bot.action('my_referrals', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        const settings = await getAppSettings();
        if (settings.enable_referral === false) {
            return ctx.reply("❌ Le système de parrainage est actuellement désactivé.").catch(() => {});
        }
        
        const userId = ctx.from.id;
        const botUsername = ctx.botInfo.username;
        const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;
        
        const text = `🎁 <b>PARRAINAGE</b>\n\n` +
            `Invitez vos amis et gagnez des bonus sur vos prochaines commandes !\n\n` +
            `🔗 <b>Votre lien :</b>\n<code>${refLink}</code>\n\n` +
            `<i>Partagez ce lien pour commencer à parrainer dès maintenant.</i>`;
            
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.url('🚀 Partager', `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Rejoins-moi sur Farmstegridy_bot !")}`)],
            [Markup.button.callback('◀️ Retour', 'main_menu')]
        ]);
        
        return safeEdit(ctx, text, keyboard);
    });

    bot.action('channel_link', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        const settings = await getAppSettings();
        const channelUrl = settings.channel_url || '';
        
        const text = `📢 <b>NOTRE CANAL</b>\n\n` +
            `Rejoignez notre canal pour ne rien rater des nouveautés et promotions !\n\n` +
            (channelUrl ? `🔗 <a href="${channelUrl}">Cliquez ici pour rejoindre</a>` : `<i>Lien indisponible pour le moment.</i>`);
            
        const b = [];
        if (channelUrl) b.push([Markup.button.url('📢 Rejoindre', channelUrl)]);
        b.push([Markup.button.callback('◀️ Retour', 'main_menu')]);
        
        return safeEdit(ctx, text, Markup.inlineKeyboard(b));
    });

    bot.action('private_contact', async (ctx) => {
        if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
        const settings = await getAppSettings();
        const contactUrl = settings.private_contact_url || '';
        
        const text = `📞 <b>CONTACTEZ-NOUS</b>\n\n` +
            `Une question ? Un problème ? Notre support est à votre disposition.`;
            
        const b = [];
        if (contactUrl) b.push([Markup.button.url('✉️ Support Telegram', contactUrl)]);

        // NOUVEAU : Affichage des liens personnalisés
        try {
            const customLinks = typeof settings.custom_links === 'string' ? JSON.parse(settings.custom_links) : (settings.custom_links || []);
            if (Array.isArray(customLinks)) {
                customLinks.forEach(link => {
                    b.push([Markup.button.url(`${link.icon || '🔗'} ${link.label || 'Lien'}`, link.url)]);
                });
            }
        } catch (e) { console.error('[CUSTOM_LINKS] Error parsing:', e); }

        b.push([Markup.button.callback('◀️ Retour', 'main_menu')]);
        
        return safeEdit(ctx, text, Markup.inlineKeyboard(b));
    });
}

async function showMainMenu(ctx, forceClient = false) {
    const userId = `${ctx.platform}_${ctx.from.id}`;
    const settings = await getAppSettings();
    const user = await getUser(userId);
    
    if (user && user.is_livreur && !forceClient) {
        const { getLivreurOrders } = require('../services/database');
        const activeOrders = await getLivreurOrders(userId);
        const hasActive = activeOrders.length > 0;
        const isAvail = user.is_available;
        const livreurText = `${settings.ui_icon_livreur || '🚴'} <b>Espace Livreur</b>\n\n` +
            `👤 ${user.first_name}\n` +
            `📍 Secteur : <b>${(user.current_city || 'INCONNU').toUpperCase()}</b>\n` +
            `🔘 Statut : <b>${isAvail ? '✅ DISPONIBLE' : '❌ INDISPONIBLE'}</b>`;
        const keyboard = await getLivreurMenuKeyboard(ctx, settings, user, hasActive);
        await safeEdit(ctx, livreurText, keyboard);
        await updateMenuButton(ctx, user, settings, false);
        return;
    }

    // Mode client (normal ou forcé pour un livreur)
    const text = user?.is_livreur
        ? `🛝 <b>Mode Client</b>\n<i>Vous naviguez comme un client. Cliquez "Livreur" pour revenir à votre espace.</i>`
        : t(user, 'menu_main', `📋 <b>Menu principal</b>`);
    const [isAdminUser, supplier] = await Promise.all([isAdmin(ctx), getSupplierByTelegramId(String(ctx.from.id))]);
    const isFournisseur = !!(supplier && (supplier.status === 'active' || supplier.is_active));
    const keyboard = await getMainMenuKeyboard(ctx, settings, user, isFournisseur, isAdminUser);

    await safeEdit(ctx, text, {
        photo: settings.welcome_photo || null,
        reply_markup: keyboard.reply_markup || keyboard
    });
    await updateMenuButton(ctx, user, settings, forceClient);
}

async function getMainMenuKeyboard(ctx, settings, user, isFournisseur = false, isAdminUser = false) {
    if (!settings) settings = ctx.state?.settings || await getAppSettings();
    const buttons = [];

    const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
    const catalogUrl = settings.mini_app_url ? `${settings.mini_app_url}/catalog` : `${baseDomain}/catalog`;
    
    buttons.push([
        Markup.button.callback(`${settings.ui_icon_catalog || '🛍'} CATALOGUE CLASSIQUE`, 'view_catalog'),
    ]);
    buttons.push([
        Markup.button.webApp(`✨ CATALOGUE MINI APP ✨`, catalogUrl)
    ]);
    
    buttons.push([
        Markup.button.callback(`${settings.ui_icon_cart || '🛒'} ${t(user, 'btn_cart', 'Mon Panier (Mes produits)')}`, 'view_cart'),
        Markup.button.callback(`${settings.ui_icon_orders || '📦'} ${t(user, 'btn_orders', 'Mes Commandes')}`, 'my_orders')
    ]);

    buttons.push([
        Markup.button.callback(`${settings.ui_icon_support || '❓'} Aide & Contact`, 'help_menu')
    ]);

    buttons.push([
        Markup.button.callback(`${settings.ui_icon_profile || '🎁'} Parrain`, 'my_referrals'),
        Markup.button.callback(`${settings.ui_icon_channel || '📢'} Canal`, 'channel_link')
    ]);

    const spaces = [];
    // if (isFournisseur) spaces.push(Markup.button.callback('🏪 Fournisseur', 'supplier_menu'));
    if (spaces.length > 0) buttons.push(spaces);

    const footers = [Markup.button.callback(`${settings.btn_settings || '⚙️'} Réglages`, 'user_settings')];
    if (isAdminUser || user?.is_admin) footers.push(Markup.button.callback(`${settings.ui_icon_admin || '🛠'} Admin`, 'admin_menu'));
    if (user && user.is_livreur) footers.push(Markup.button.callback(`${settings.ui_icon_livreur || '🚴'} Livreur`, 'livreur_menu'));
    buttons.push(footers);

    return Markup.inlineKeyboard(buttons);
}

async function getLivreurMenuKeyboard(ctx, settings, user, hasActiveOrders = false, isAdminUser = false) {
    const isAvail = user?.is_available || user?.data?.is_available;
    const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
    const livreurUrl = `${baseDomain}/livreur`;
    
    const buttons = [
        [Markup.button.webApp('✨ ESPACE LIVREUR (MINI APP) ✨', livreurUrl)],
        [Markup.button.callback(isAvail ? '🔴 Indisponible' : '🟢 Disponible', isAvail ? 'set_dispo_false' : 'set_dispo_true')],
        [Markup.button.callback('📦 Commandes', 'show_available_orders'), Markup.button.callback('🗓 Planifiées', 'show_planned_orders')],
        [Markup.button.callback('📈 Historique', 'my_deliveries'), Markup.button.callback('🛍 Client', 'client_mode_force')]
    ];
    if (hasActiveOrders) buttons.unshift([Markup.button.callback('🚚 MES LIVRAISONS 🔥', 'active_deliveries')]);
    if (isAdminUser || user?.is_admin) buttons.push([Markup.button.callback('🛠 Admin', 'admin_menu')]);
    return Markup.inlineKeyboard(buttons);
}

async function updateMenuButton(ctx, user, settings, forceClient = false) {
    if (!ctx.telegram || !ctx.chat) return;
    try {
        if (!settings) settings = await getAppSettings();
        const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
        const catalogUrl = settings.mini_app_url ? `${settings.mini_app_url}/catalog` : `${baseDomain}/catalog`;
        const livreurUrl = settings.mini_app_url ? `${settings.mini_app_url}/livreur` : `${baseDomain}/livreur`;
        const dashboardUrl = settings.mini_app_url ? `${settings.mini_app_url}/dashboard` : `${baseDomain}/dashboard`;

        const isAdminUser = await isAdmin(ctx);

        if (isAdminUser && !forceClient) {
            await ctx.telegram.setChatMenuButton(ctx.chat.id, {
                type: 'web_app',
                text: `${settings.ui_icon_admin || '🛠️'} Dashboard`,
                web_app: { url: dashboardUrl }
            }).catch(() => {});
        } else if (user && user.is_livreur && !forceClient) {
            await ctx.telegram.setChatMenuButton(ctx.chat.id, {
                type: 'web_app',
                text: `${settings.ui_icon_livreur || '🚴'} Livreur`,
                web_app: { url: livreurUrl }
            }).catch(() => {});
        } else {
            await ctx.telegram.setChatMenuButton(ctx.chat.id, {
                type: 'web_app',
                text: `${settings.ui_icon_catalog || '🛍️'} Catalogue`,
                web_app: { url: catalogUrl }
            }).catch(() => {});
        }
    } catch (e) {
        console.error('Error updating chat menu button:', e.message);
    }
}

module.exports = { setupStartHandler, getLivreurMenuKeyboard, getMainMenuKeyboard, updateMenuButton };
