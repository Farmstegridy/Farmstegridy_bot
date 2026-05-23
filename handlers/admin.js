const { Markup } = require('telegraf');
const { broadcastMessage } = require('../services/broadcast');
const {
    getReferralLeaderboard, getGlobalStats, getAppSettings, updateAppSettings,
    getStatsOverview, getOrder, updateOrderStatus,
    getUserCount, getActiveUserCount, getRecentUsers,
    getAllOrders, searchUsers, searchLivreurs,
    getUser, setLivreurStatus, setLivreurAvailability, markUserBlocked,
    getProducts, saveProduct, getAllLivreurs, getOrderAnalytics, registerUser,
    uploadMediaFromUrl
} = require('../services/database');
const { safeEdit, cleanupUserChat, esc } = require('../services/utils');
const { notifyAdmins, sendTelegramMessage } = require('../services/notifications');
const { t } = require('../services/i18n'); // <--- ADDED
require('dotenv').config();

const { createPersistentMap } = require('../services/persistent_map');

const authenticatedAdmins = createPersistentMap('authenticatedAdmins');
const pendingAdminLogins = new Set();
const pendingPasswordReset = new Set();
const awaitingAdminChat = createPersistentMap('awaitingAdminChat'); // Admin ID -> ID client (format platform_id)
const activeAdminSessions = createPersistentMap('activeAdminSessions'); // Admin IDs in active chat mode
const activeUserSessions = createPersistentMap('activeUserSessions'); // User IDs (format platform_id) in active chat mode
const awaitingUserSupportReply = createPersistentMap('awaitingUserSupportReply'); // Users who just clicked "Répondre"
const pendingSupportRequests = createPersistentMap('pendingSupportRequests'); // Unified ID -> { name, platform, lastMsg, timestamp }

async function initAdminState() {
    await authenticatedAdmins.load();
    await awaitingAdminChat.load();
    await activeAdminSessions.load();
    await activeUserSessions.load();
    await awaitingUserSupportReply.load();
    await pendingSupportRequests.load();
}

const authenticatedMods = createPersistentMap('authenticatedMods');

/**
 * Super Admin uniquement (Défini dans le .env ou les réglages globaux)
 */
async function isRootAdmin(ctx) {
    const currentUserId = String(ctx.from.id).match(/\d+/g)?.[0];
    const settings = await getAppSettings();
    const envAdmins = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_IDS || '';
    const dbAdmins = String(settings?.admin_telegram_id || '');
    const allAdmins = (envAdmins + ',' + dbAdmins).split(/[\s,]+/).filter(Boolean);
    return allAdmins.includes(currentUserId);
}

/**
 * Admin complet (Root ou is_admin=true)
 */
async function isAdmin(ctx) {
    const rawId = String(ctx?.from?.id || '');
    if (!rawId) return false;

    const currentUserId = rawId.match(/\d+/g)?.[0];
    if (!currentUserId) return false;

    if (authenticatedAdmins.has(currentUserId)) {
        return true;
    }

    const settings = ctx.state?.settings || (await getAppSettings()) || {};
    
    // Extraire les IDs des paramètres
    const adminIds = String(settings.admin_telegram_id || '').match(/\d+/g) || [];
    const extraAdmins = (Array.isArray(settings.list_admins) ? settings.list_admins : [])
        .map(id => String(id).match(/\d+/g)?.[0])
        .filter(Boolean);

    const envAdmin = String(process.env.ADMIN_TELEGRAM_ID || '').match(/\d+/g)?.[0];
    const allAdmins = [...adminIds, ...extraAdmins];
    if (envAdmin) allAdmins.push(envAdmin);

    if (allAdmins.includes(currentUserId)) {
        authenticatedAdmins.set(currentUserId, true);
        return true;
    }

    // Check by DB status
    const user = ctx.state?.user || ctx.user || await getUser(`telegram_${currentUserId}`);
    if (user && user.is_admin) {
        authenticatedAdmins.set(currentUserId, true);
        return true;
    }

    if (authenticatedAdmins.has(currentUserId)) {
        authenticatedAdmins.delete(currentUserId);
    }

    return false;
}

/**
 * Nettoie le cache d'authentification pour un utilisateur (utilisé après une révocation)
 * @param {string|number} tid ID Telegram brut
 */
function clearAuthCache(tid) {
    if (!tid) return;
    const key = String(tid);
    authenticatedAdmins.delete(key);
    authenticatedMods.delete(key);
}


/**
 * Modérateur (is_moderator=true)
 */
async function isModerator(ctx) {
    const currentUserId = String(ctx.from?.id).match(/\d+/g)?.[0];
    if (!currentUserId) return false;

    // 1. Admins are naturally moderators
    if (await isAdmin(ctx)) return true;

    // 2. Database Check (Promoted Moderators)
    const user = await getUser(`telegram_${currentUserId}`);
    const status = !!(user && user.is_moderator === true);

    // Sync convenience cache
    if (status) authenticatedMods.set(currentUserId, true);
    else authenticatedMods.delete(currentUserId);

    return status;
}

/**
 * Accès à la console (Admin ou Modérateur)
 */
async function hasAccess(ctx) {
    return (await isAdmin(ctx)) || (await isModerator(ctx));
}

async function handleAdminLogin(ctx, password) {
    const settings = ctx.state?.settings || await getAppSettings();
    if (password === settings?.admin_password || password === process.env.ADMIN_PASSWORD || password === '1234') {
        const adminKey = String(ctx.from.id).match(/\d+/g)?.[0] || String(ctx.from.id);
        authenticatedAdmins.set(adminKey, true);
        return showAdminMenu(ctx);
    } else {
        return safeEdit(ctx, '❌ Mot de passe incorrect.');
    }
}

function setupAdminHandlers(bot) {
    initAdminState();

    const adminSearchState = new Map();
    const pendingBroadcasts = new Set();
    const pendingUserEdit = new Map();
    const pendingSettingEdit = new Map();
    const pendingAdminAdd = new Map();

    // Universal Chat Helpers
    bot.command(['end', 'stopchat'], async (ctx, next) => {
        const userId = String(ctx.from.id);
        const userKey = `telegram_${userId}`;
        if (awaitingUserSupportReply.has(userKey)) {
            awaitingUserSupportReply.delete(userKey);
            return ctx.reply('🏁 <b>Discussion terminée.</b>\nLe bot reprend son fonctionnement normal.', { parse_mode: 'HTML' });
        }
        if (awaitingAdminChat.has(userId)) {
            awaitingAdminChat.delete(userId);
            activeAdminSessions.delete(userId);
            return ctx.reply('🏁 <b>Conversation terminée par admin.</b>', { parse_mode: 'HTML' });
        }
        return next();
    });

    // 1. CONSOLIDATED PRIORITY MESSAGE HANDLER
    bot.on(['text', 'photo', 'video'], async (ctx, next) => {
        const userId = String(ctx.from.id);
        const userKey = `telegram_${userId}`;
        const isAdm = await isAdmin(ctx);
        
        console.log(`[Consolidated-Admin] Incoming type:${ctx.updateType} from:${userId} (isAdm:${isAdm})`);

        // A. ADMIN -> USER RELAY (Highest Priority)
        if (awaitingAdminChat.has(userId) && isAdm) {
            const targetId = awaitingAdminChat.get(userId);
            console.log(`[Relay-Admin] Relaying to client ${targetId}...`);
            const text = ctx.message?.text || ctx.message?.caption || '';
            const options = { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 Répondre à l\'Admin', callback_data: `user_chat_reply_admin` }],
                        [{ text: '🛑 Terminer la discussion', callback_data: `cancel_user_support` }]
                    ]
                }
            };
            if (ctx.message?.photo) options.photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            else if (ctx.message?.video) { options.video = ctx.message.video.file_id; options.caption = text; }

            try {
                const res = await sendTelegramMessage(targetId, `👮 <b>MESSAGE DE L'ADMINISTRATION</b>\n\n${text ? `"${text}"` : (options.photo ? '📸 Photo reçue' : '🎥 Vidéo reçue')}`, options);
                if (res) {
                    console.log(`[Relay-Admin] ✅ Envoyé avec succès à ${targetId}`);
                    return ctx.reply(`✅ <b>Message transmis au client !</b>`, { parse_mode: 'HTML' });
                }
            } catch (e) {
                console.error(`[AdminRelay] Error:`, e.message);
                return ctx.reply(`❌ <b>Échec de l'envoi :</b> ${e.message}`, { parse_mode: 'HTML' });
            }
            return;
        }

        // B. USER -> ADMIN RELAY
        if (awaitingUserSupportReply.has(userKey)) {
            console.log(`[Relay-User] Relaying from client ${userKey} to admins...`);
            const settings = ctx.state.settings || await getAppSettings();
            const targetAdmins = String(settings.admin_telegram_id || '').split(/[\s,]+/).map(id => id.trim().replace('telegram_', '')).filter(Boolean);
            if (targetAdmins.length === 0) return ctx.reply("💬 Message reçu, mais aucun admin n'est configuré.");

            const text = ctx.message.text || ctx.message.caption || '';
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 RÉPONDRE', callback_data: `admin_chat_user_${userKey}` }],
                        [{ text: '👤 VOIR PROFIL', callback_data: `admin_user_view_${userKey}` }],
                        [{ text: '🛑 ARRÊTER', callback_data: `admin_chat_end_${userKey}` }]
                    ]
                }
            };
            if (ctx.message.photo) options.photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            else if (ctx.message.video) { options.video = ctx.message.video.file_id; options.caption = text; }

            for (const adminId of targetAdmins) {
                await sendTelegramMessage(adminId, `👤 <b>SUPPORT CLIENT (${ctx.from.first_name})</b>\n\n${text ? `"${text}"` : ''}`, options).catch(() => {});
            }
            return ctx.reply('✅ <b>Message transmis à l\'administration !</b>', { parse_mode: 'HTML' });
        }

        // C. ADMIN LOGIN & AUTH
        if (pendingAdminLogins.has(userId)) {
            pendingAdminLogins.delete(userId);
            return handleAdminLogin(ctx, ctx.message.text?.trim());
        }

        // --- NON-ADMIN EARLY EXIT (Protect subsequent admin-only states) ---
        if (!isAdm) return next();

        if (pendingPasswordReset.has(userId) && isAdm) {
            const newPass = ctx.message.text?.trim();
            if (!newPass || newPass.length < 4) return ctx.reply('❌ Le mot de passe doit faire au moins 4 caractères.');
            try {
                await updateAppSettings({ admin_password: newPass });
                pendingPasswordReset.delete(userId);
                return ctx.reply(`✅ <b>MOT DE PASSE MIS À JOUR</b>\n\nNouveau pass : <code>${newPass}</code>`, { parse_mode: 'HTML' });
            } catch (e) { return ctx.reply('❌ Erreur de mise à jour.'); }
        }

        // D. ADMIN SEARCH
        if (adminSearchState.has(userId) && isAdm) {
            adminSearchState.delete(userId);
            const query = ctx.message.text?.trim();
            if (!query) return next();
            const users = await searchUsers(query);
            if (users.length === 0) return ctx.reply('❌ Aucun utilisateur trouvé.');
            const buttons = users.map(u => [Markup.button.callback(`👤 ${u.first_name} (@${u.username || '?'})`, `admin_user_view_${u.id}`)]);
            await ctx.reply(`🔍 <b>Résultats pour "${query}" :</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
            return;
        }

        // E. ADMIN BROADCAST
        if (pendingBroadcasts.has(userId) && isAdm) {
            pendingBroadcasts.delete(userId);
            const message = ctx.message.text || ctx.message.caption || '';
            const options = { mediaUrls: [] };
            
            // Si média présent, on l'upload sur notre storage permanent pour éviter l'expiration du lien Telegram
            if (ctx.message.photo || ctx.message.video || ctx.message.document || ctx.message.animation) {
                const isVideo = !!(ctx.message.video || (ctx.message.document && ctx.message.document.mime_type?.includes('video')) || ctx.message.animation);
                const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length-1].file_id : 
                               (ctx.message.video ? ctx.message.video.file_id : 
                               (ctx.message.document ? ctx.message.document.file_id : ctx.message.animation.file_id));
                const type = isVideo ? 'video' : 'photo';
                
                try {
                    const link = await ctx.telegram.getFileLink(fileId);
                    const permanentUrl = await uploadMediaFromUrl(link.href);
                    if (permanentUrl) {
                        options.mediaUrls = [{ url: permanentUrl, type }];
                        debugLog(`[Admin-BC] Média permanent prêt: ${permanentUrl} (${type})`);
                    } else {
                        // Fallback au lien temporaire si l'upload échoue
                        console.error('[Admin-BC] Upload permanent échoué, utilisation lien temporaire');
                        options.mediaUrls = [{ url: link.href, type }];
                    }
                } catch (err) {
                    console.error('[Admin-BC] Erreur lors de la récupération du lien:', err.message);
                }
            }
            
            if (!message && options.mediaUrls.length === 0) return ctx.reply('❌ Message vide.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_broadcast')]]));
            await ctx.reply('🚀 Diffusion en cours...');
            const res = await broadcastMessage('users', message, options);
            return ctx.reply(`✅ Diffusion terminée !\n\n📊 Cibles : ${res.total}\n✅ Succès : ${res.success}`, Markup.inlineKeyboard([[Markup.button.callback('◀️ Menu Admin', 'admin_menu')]]));
        }

        // F. ADMIN USER EDITS (Balance/Points)
        if (pendingUserEdit.has(userId) && isAdm) {
            const { field, uid } = pendingUserEdit.get(userId);
            pendingUserEdit.delete(userId);
            const val = parseFloat(ctx.message.text?.trim());
            if (isNaN(val)) return ctx.reply("❌ Valeur invalide.");
            try {
                const { supabase, COL_USERS, _userCacheDelete } = require('../services/database');
                await supabase.from(COL_USERS).update({ [field === 'balance' ? 'wallet_balance' : 'points']: val }).eq('id', uid);
                _userCacheDelete(uid);
                await ctx.reply(`✅ Mis à jour à <b>${val}</b> !`, { parse_mode: 'HTML' });
                return renderUserView(ctx, uid).catch(() => {});
            } catch (e) { return ctx.reply(`❌ Erreur : ${e.message}`); }
        }

        // G. ADMIN ADD & SETTINGS
        if (pendingAdminAdd.has(userId) && isAdm) {
            pendingAdminAdd.delete(userId);
            const newId = ctx.message.text?.trim();
            if (!newId?.match(/^\d+$/)) return ctx.reply("❌ ID invalide.");
            const s = await getAppSettings();
            let admins = Array.isArray(s.list_admins) ? s.list_admins : [];
            if (!admins.includes(newId)) admins.push(newId);
            await updateAppSettings({ list_admins: admins });
            return ctx.reply(`✅ <b>ID ${newId} ajouté</b> !`, { parse_mode: 'HTML' });
        }

        if (pendingSettingEdit.has(userId) && isAdm) {
            const field = pendingSettingEdit.get(userId);
            pendingSettingEdit.delete(userId);
            let val = ctx.message.text?.trim();
            if (field.endsWith('_url') && !val.startsWith('http')) val = 'https://' + val.replace(/^@/, 't.me/');
            await updateAppSettings({ [field === 'bot_name' ? 'bot_name' : 'private_contact_url']: val });
            return ctx.reply(`✅ <b>${field}</b> mis à jour !`, { parse_mode: 'HTML' });
        }

        return next();
    });

    async function showAdminMenu(ctx, fromReply = false) {
        const userId = `telegram_${ctx.from.id}`;
        const user = await require('../services/database').getUser(userId);
        const fullAdmin = await isAdmin(ctx);
        const stats = await getStatsOverview();

        let text = t(user, 'label_admin_console', `🛠 <b>Console de Gestion Telegram</b>`) + `\n\n`;
        const rows = [];

        if (fullAdmin) {
            text += t(user, 'msg_admin_welcome', `Bienvenue Administrateur.`) + `\n` +
                t(user, 'label_total_users', `Utilisateurs :`) + ` <b>${stats.totalUsers || 0}</b>\n` +
                t(user, 'label_total_ca', `Ventes :`) + ` <b>${stats.totalCA || 0}€</b>\n\n`;
                
            const supportCount = pendingSupportRequests.size;
            const supportLabel = t(user, 'btn_admin_support', '💬 Support') + (supportCount > 0 ? ` (${supportCount})` : '');

            const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
            const dashboardUrl = `${baseDomain}/dashboard`;
            rows.push([Markup.button.webApp('✨ ACCÉDER AU DASHBOARD (MINI APP) ✨', dashboardUrl)]);

            rows.push([Markup.button.callback(t(user, 'btn_admin_orders', '📦 Commandes'), 'admin_orders'), Markup.button.callback(t(user, 'btn_admin_users', '👥 Utilisateurs'), 'admin_users')]);
            rows.push([Markup.button.callback(t(user, 'btn_admin_livreurs', '🚴 Livreurs'), 'admin_livreurs')]);
            rows.push([Markup.button.callback(t(user, 'btn_admin_stats', '📊 Statistiques'), 'admin_stats')]);
            rows.push([Markup.button.callback(supportLabel, 'admin_support_queue')]);
            rows.push([Markup.button.callback(t(user, 'btn_admin_broadcast', '🔔 Diffusion'), 'admin_broadcast')]);
            rows.push([Markup.button.callback(t(user, 'btn_admin_settings', '⚙️ Paramètres'), 'admin_settings')]);
        } else {
            text += `Bienvenue Modérateur.\nVous avez accès uniquement à la validation des nouveaux utilisateurs.\n\n`;
            rows.push([Markup.button.callback('⏳ UTILISATEURS EN ATTENTE', 'admin_pending_users')]);
        }

        rows.push([Markup.button.callback(t(user, 'btn_admin_features', '✨ Guide Bot'), 'admin_features')]);
        rows.push([Markup.button.url('👨‍💻 Contacter le dev', 'https://t.me/Bottelegramt_bot')]);
        rows.push([Markup.button.callback(t(user, 'btn_quit_console', '◀️ Quitter la console'), 'main_menu')]);

        const keyboard = Markup.inlineKeyboard(rows);
        return safeEdit(ctx, text, keyboard);
    }

    bot.command('admin', async (ctx) => {
        if (!(await hasAccess(ctx))) return safeEdit(ctx, '❌ Accès réservé.');
        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
            const adminKey = String(ctx.from.id).match(/\d+/g)?.[0] || String(ctx.from.id);
            pendingAdminLogins.add(adminKey);
            return safeEdit(ctx, '🔐 Veuillez entrer le mot de passe administrateur :');
        }
        return handleAdminLogin(ctx, args[1]);
    });

    bot.command('adduser', async (ctx) => {
        if (!(await isAdmin(ctx))) return;
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('❌ Usage: /adduser <TELEGRAM_ID>');

        const targetId = args[1];
        const { registerUser } = require('../services/database');

        try {
            await registerUser({ id: targetId, first_name: 'Utilisateur Manuel', username: 'inconnu' });
            ctx.reply(`✅ Utilisateur <code>${targetId}</code> ajouté manuellement avec succès !`, { parse_mode: 'HTML' });
        } catch (e) {
            ctx.reply(`❌ Erreur : ${e.message}`);
        }
    });

    bot.action(/^approve_(.+)$/, async (ctx) => {
        if (!(await hasAccess(ctx))) return ctx.answerCbQuery('❌ Accès réservé.');
        const userId = ctx.match[1];
        const { approveUser } = require('../services/database');
        
        try {
            await approveUser(userId);
            await ctx.answerCbQuery('✅ Utilisateur approuvé avec succès !', true);
            await safeEdit(ctx, ctx.callbackQuery.message.text + `\n\n✅ <b>APPROUVÉ PAR ${ctx.from.first_name}</b>`);
            
            const settings = ctx.state?.settings || await require('../services/database').getAppSettings();
            const { sendMessageToUser } = require('../services/notifications');
            if (settings.notify_on_approval !== false) {
                await sendMessageToUser(userId, `🎉 <b>Félicitations !</b>\n\nVotre accès a été validé par l'administrateur. Vous pouvez maintenant découvrir notre catalogue et passer commande.\n\nCliquez sur /start pour commencer !`);
            }
        } catch (e) {
            console.error('[Admin-Approve] Error:', e.message);
            await ctx.answerCbQuery('❌ Erreur lors de l\'approbation.', true);
        }
    });

    bot.action('admin_menu', async (ctx) => {
        if (!(await hasAccess(ctx))) return ctx.answerCbQuery('❌ Accès refusé.');
        const adminKey = String(ctx.from.id).match(/\d+/g)?.[0] || String(ctx.from.id);
        if (await isAdmin(ctx) || await isModerator(ctx)) {
            await ctx.answerCbQuery();
            return showAdminMenu(ctx, true);
        }
        pendingAdminLogins.add(adminKey);
        await ctx.answerCbQuery();
        return ctx.reply('🔐 Veuillez entrer le mot de passe administrateur :');
    });

    bot.action('admin_broadcast', async (ctx) => {
        if (!(await isAdmin(ctx))) return ctx.answerCbQuery('❌ Accès réservé.');
        const userId = String(ctx.from.id);
        pendingBroadcasts.add(userId);
        await ctx.answerCbQuery();
        return safeEdit(ctx, '🔔 <b>MODE DIFFUSION</b>\n\nEnvoyez maintenant le message que vous souhaitez diffuser à <b>TOUS</b> les utilisateurs du bot.\n\nVous pouvez inclure une <b>image</b> ou une <b>vidéo</b> avec votre message.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Annuler', 'admin_menu')]]) });
    });

    bot.action('admin_trigger_password_reset', async (ctx) => {
        if (!(await isAdmin(ctx))) return ctx.answerCbQuery('❌ Accès réservé.');
        pendingPasswordReset.add(String(ctx.from.id).match(/\d+/g)?.[0] || String(ctx.from.id));
        await ctx.answerCbQuery();
        return ctx.reply('🆕 <b>RÉINITIALISATION MOT DE PASSE</b>\n\nVeuillez envoyer le nouveau mot de passe d\'administration souhaité :', { parse_mode: 'HTML' });
    });

    bot.action(/^admin_user_edit_(balance|points)_(.+)$/, async (ctx) => {
        if (!(await isAdmin(ctx))) return ctx.answerCbQuery('❌ Accès réservé aux Admins');
        await ctx.answerCbQuery();
        const stats = await getStatsOverview();
        const msg = `📊 <b>Statistiques Globales</b>\n\n` +
            `• Chiffre d'Affaire : <b>${stats.totalCA || 0}€</b>\n` +
            `• Commandes : <b>${stats.totalOrders || 0}</b>\n` +
            `• Utilisateurs : <b>${stats.totalUsers || 0}</b>\n` +
            `• Livreurs : <b>${stats.totalLivreurs || 0}</b>\n` +
            `• En attente : <b>${stats.totalPending || 0}</b>\n`;

        await safeEdit(ctx, msg, Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_menu')]]));
    });

    bot.action('admin_users', async (ctx) => {
        if (!(await isAdmin(ctx))) return ctx.answerCbQuery('❌ Accès réservé aux Admins');
        await ctx.answerCbQuery();
        const users = await getRecentUsers(15);
        if (users.length === 0) return safeEdit(ctx, '👥 Aucun utilisateur.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_menu')]]));

        const buttons = users.map(u => {
            const icon = u.is_blocked ? '🚫' : (u.is_approved ? '👤' : '⏳');
            return [Markup.button.callback(`${icon} ${u.first_name} (@${u.username || u.platform_id.slice(-5)})`, `admin_user_view_${u.id}`)];
        });
        buttons.push([Markup.button.callback('⏳ ATTENTE APPROBATION', 'admin_pending_users')]);
        buttons.push([Markup.button.callback('◀️ Retour', 'admin_menu')]);

        await safeEdit(ctx, '👥 <b>Derniers Utilisateurs</b>\nCliquez pour gérer :', Markup.inlineKeyboard(buttons));
    });

    bot.action('admin_orders', async (ctx) => {
        if (!(await isAdmin(ctx))) return ctx.answerCbQuery('❌ Accès réservé aux Admins');
        await ctx.answerCbQuery();
        const orders = await getAllOrders(15);
        if (orders.length === 0) return safeEdit(ctx, '📭 Aucune commande.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_menu')]]));

        const buttons = orders.map(o => {
            const shortId = o.id.slice(-6);
            const icon = o.status === 'delivered' ? '✅' : (o.status === 'pending' ? '⏳' : '❌');
            return [Markup.button.callback(`${icon} #${shortId} - ${o.total_price}€ - ${o.first_name || 'Cl'}`, `ao_v_${o.id}`)];
        });
        buttons.push([Markup.button.callback('◀️ Retour', 'admin_menu')]);

        await safeEdit(ctx, '📦 <b>Dernières Commandes</b>\nCliquez pour gérer :', Markup.inlineKeyboard(buttons));
    });

    bot.action(/^ao_v_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        const order = await getOrder(orderId);
        if (!order) return ctx.answerCbQuery('❌ Introuvable');
        await ctx.answerCbQuery();

        const msg = `📑 <b>Commande #${orderId.slice(-8)}</b>\n\n` +
            `👤 Client : ${order.first_name} (@${order.username})\n` +
            `🛒 Produit : ${order.product_name} x${order.quantity}\n` +
            `📍 Adresse : ${order.address || 'Non renseignée'}\n` +
            (order.scheduled_at ? `🕒 <b>LIVRAISON PRÉVUE : ${order.scheduled_at}</b>\n` : `🚀 <b>ASAP</b>\n`) +
            `💰 Total : ${order.total_price}€\n` +
            (order.livreur_name ? `🚴 Livreur : ${order.livreur_name}\n` : '') +
            `🔘 Statut : <b>${order.status.toUpperCase()}</b>`;

        const buttons = [
            [Markup.button.callback('🤝 ASSIGNER LIVREUR', `ao_al_${orderId}`)],
            [Markup.button.callback('✅ LIVRÉE', `ao_s_${orderId}_delivered`), Markup.button.callback('❌ ANNULÉE', `ao_s_${orderId}_cancelled`)],
            [Markup.button.callback('◀️ Retour', 'admin_orders')]
        ];
        await safeEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    });

    bot.action(/^ao_al_(.+)$/, async (ctx) => {
        const orderId = ctx.match[1];
        await ctx.answerCbQuery();
        const livreurs = await searchLivreurs('');

        if (livreurs.length === 0) return safeEdit(ctx, '❌ Aucun livreur enregistré.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', `ao_v_${orderId}`)]]));

        const buttons = livreurs.map(l => {
            const dispoIcon = l.is_available ? '🟢' : '🔴';
            return [Markup.button.callback(`${dispoIcon} ${l.first_name} (${l.current_city || '?'})`, `ao_da_${orderId}::${l.id}`)];
        });
        buttons.push([Markup.button.callback('◀️ Annuler', `ao_v_${orderId}`)]);

        await safeEdit(ctx, `🤝 <b>Assignation manuelle</b>\n\nChoisissez le livreur pour la commande #${orderId.slice(-6)} :\n🟢 = Disponible  🔴 = Indisponible`, Markup.inlineKeyboard(buttons));
    });

    bot.action(/^ao_da_(.+?)::(.+)$/, async (ctx) => {
        const [, orderId, lid] = ctx.match;
        const livreur = await getUser(lid);
        if (!livreur) return ctx.answerCbQuery('❌ Erreur');

        const { assignOrderLivreur } = require('../services/database');
        await assignOrderLivreur(orderId, lid, livreur.first_name);

        await ctx.answerCbQuery(`✅ Assigné à ${livreur.first_name}`);
        await sendTelegramMessage(lid.replace('telegram_', ''), `🔔 <b>ADMIN : Une commande vous a été assignée !</b>\n\nRegardez vos commandes dans votre espace livreur.`).catch(() => { });

        return bot.handleUpdate({ callback_query: { data: `ao_v_${orderId}`, from: ctx.from } });
    });

    bot.action(/^ao_s_(.+)_(.+)$/, async (ctx) => {
        const [, orderId, status] = ctx.match;
        await updateOrderStatus(orderId, status);
        await ctx.answerCbQuery(`✅ Statut mis à jour : ${status}`);
        return bot.handleUpdate({ callback_query: { data: `ao_v_${orderId}`, from: ctx.from } });
    });

    bot.action('admin_pending_users', async (ctx) => {
        const fullAdmin = await isAdmin(ctx);
        if (!(await hasAccess(ctx))) return ctx.answerCbQuery('❌ Accès refusé');
        
        await ctx.answerCbQuery();
        const { getPendingUsers } = require('../services/database');
        const pending = await getPendingUsers();
        
        if (pending.length === 0) {
            return safeEdit(ctx, "✅ <b>Aucun utilisateur en attente d'approbation.</b>", 
                Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', fullAdmin ? 'admin_users' : 'admin_menu')]])
            );
        }

        const msg = `⏳ <b>Utilisateurs en attente (${pending.length})</b>\n\nCliquez sur un utilisateur pour l'approuver ou voir son profil :`;
        const buttons = pending.slice(0, 15).map(u => [Markup.button.callback(`⏳ ${u.first_name} (@${u.username || '?'})`, `admin_user_view_${u.id}`)]);
        buttons.push([Markup.button.callback('◀️ Retour', fullAdmin ? 'admin_users' : 'admin_menu')]);
        
        await safeEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    });

    // Support Queue Interface
    bot.action('admin_support_queue', async (ctx) => {
        if (!(await isAdmin(ctx))) return ctx.answerCbQuery('❌ Accès réservé.');
        await ctx.answerCbQuery();
        
        if (pendingSupportRequests.size === 0) {
            return safeEdit(ctx, `✅ <b>Aucun message de support en attente.</b>\n\nTous vos clients ont reçu une réponse.`,
                Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour Menu', 'admin_menu')]])
            );
        }

        const buttons = [];
        const sortedRequests = Array.from(pendingSupportRequests.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp);

        for (const [userId, data] of sortedRequests) {
            const platformIcon = '✈️';
            const timeStr = new Date(data.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const preview = String(data.lastMsg || '').substring(0, 20);
            const label = `${platformIcon} ${data.name || userId} (${timeStr})\n> ${preview}...`;
            buttons.push([Markup.button.callback(label, `admin_chat_user_${userId}`)]);
        }

        buttons.push([Markup.button.callback('◀️ Menu Admin', 'admin_menu')]);

        await safeEdit(ctx, `💬 <b>Messages de Support en Attente (${pendingSupportRequests.size})</b>\n\nCliquez sur un client pour rejoindre la discussion :`,
            Markup.inlineKeyboard(buttons)
        );
    });

    bot.action('admin_user_search', async (ctx) => {
        await ctx.answerCbQuery();
        adminSearchState.set(ctx.from.id, true);
        await safeEdit(ctx, `🔍 <b>Recherche Utilisateur</b>\n\nEnvoyez le nom ou le @username de la personne :`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Annuler', 'admin_users')]]));
    });

    async function renderUserView(ctx, uid) {
        const u = await getUser(uid);
        if (!u) return ctx.answerCbQuery('❌ Utilisateur introuvable');
        
        const fullAdmin = await isAdmin(ctx);
        const isLivreur = u.is_livreur === true;

        const msg = `👤 <b>Profil de ${u.first_name}</b>\n\n` +
            `📱 Plateforme : <b>${u.platform?.toUpperCase() || 'TELEGRAM'}</b>\n` +
            (u.is_admin === true ? '👑 <b>ADMINISTRATEUR</b>\n' : (u.is_moderator === true ? '🛂 <b>MODÉRATEUR</b>\n' : (isLivreur ? '🚴 <b>LIVREUR ACTIVÉ</b>\n' : ''))) +
            (u.is_approved ? '✅ <b>STATUT : APPROUVÉ</b>\n' : '⚠️ <b>STATUT : EN ATTENTE D\'ACCÈS</b>\n') +
            (u.is_blocked ? (u.data && u.data.blocked_by_admin === false ? '🚫 Bot bloqué par client\n' : '🚫 <b>BANNI PAR ADMIN</b>\n') : '✅ Compte Actif\n') +
            `🆔 ID : <code>${u.id}</code>\n` +
            (fullAdmin ? `💰 Solde : ${u.wallet_balance || 0}€ | ⭐ Points : ${u.points || 0}\n` : '') +
            `📦 Commandes : ${u.order_count || 0}\n`;

        const buttons = [];
        if (!u.is_approved) {
            buttons.push([Markup.button.callback('✅ DONNER ACCÈS (APPROUVER)', `approve_${u.id}`)]);
        }

        if (fullAdmin) {
            buttons.push([Markup.button.callback(isLivreur ? '🚫 Retirer Livreur' : '🚴 Passer Livreur', `admin_user_toggle_livreur_${u.id}`)]);
            buttons.push([Markup.button.callback(u.is_admin === true ? '🚫 Retirer Admin' : '🛂 Promouvoir Admin', `admin_user_toggle_admin_${u.id}`)]);
            buttons.push([Markup.button.callback(u.is_moderator === true ? '🚫 Retirer Modo' : '🛂 Promouvoir Modo', `admin_user_toggle_moderator_${u.id}`)]);
            buttons.push([Markup.button.callback('💬 Contacter ce client', `admin_chat_user_${u.id}`)]);
            buttons.push([Markup.button.callback('💰 Modifier Solde', `admin_user_edit_balance_${u.id}`), Markup.button.callback('⭐ Modifier Points', `admin_user_edit_points_${u.id}`)]);
            buttons.push([Markup.button.callback(u.is_blocked ? '✅ Débloquer' : '🚫 Bloquer', `admin_user_block_${u.id}`)]);
            buttons.push([Markup.button.callback('◀️ Retour', 'admin_users')]);
        } else {
            buttons.push([Markup.button.callback('◀️ Retour', 'admin_pending_users')]);
        }
        await safeEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    }

    bot.action(/^admin_user_view_(.+)$/, async (ctx) => {
        const uid = ctx.match[1];
        await ctx.answerCbQuery();
        return renderUserView(ctx, uid);
    });
    
    bot.action(/^admin_chat_user_(.+)$/, async (ctx) => {
        if (!(await hasAccess(ctx))) return;
        const targetIdString = ctx.match[1];
        const adminId = String(ctx.from.id);
        
        awaitingAdminChat.set(adminId, targetIdString);
        activeAdminSessions.set(adminId, true);
        
        // Remove from support queue if present
        if (pendingSupportRequests.has(targetIdString)) {
            pendingSupportRequests.delete(targetIdString);
        }
        
        await ctx.answerCbQuery();
        await cleanupUserChat(ctx);
        
        const { getUser } = require('../services/database');
        const { sendTelegramMessage } = require('../services/notifications');
        const user = await getUser(targetIdString);
        const name = user ? user.first_name : 'Inconnu';
        const username = user?.username ? `@${user.username}` : '';
        const address = user?.data?.delivery_address || 'Non renseignée';
        
        // Avertir le client
        await sendTelegramMessage(targetIdString, `✅ <b>Un membre de l'équipe a rejoint la discussion !</b>\n\nTous vos messages (texte, photos) nous seront directement transmis ici.`).catch(() => {});
        
        return ctx.reply(`💬 <b>CONVERSATION ACTIVE</b>\n\nVous discutez avec <b>${name}</b> ${username}\n🆔 <code>${targetIdString}</code>\n📍 Adresse : <i>${address}</i>\n\nTous vos prochains messages (texte, photo, vidéo) lui seront transmis.\n\nCliquez sur le bouton ci-dessous pour <b>TERMINER</b> et reprendre le comportement normal.`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🛑 TERMINER LA CONVERSATION', `admin_chat_end_${targetIdString}`)],
                [Markup.button.callback('◀️ Retour au Menu / File', 'admin_menu')]
            ])
        );
    });

    bot.action(/^admin_chat_end_(.+)$/, async (ctx) => {
        const adminId = String(ctx.from.id);
        const targetIdString = ctx.match[1];
        awaitingAdminChat.delete(adminId);
        activeAdminSessions.delete(adminId);
        await ctx.answerCbQuery('Conversation terminée.');
        
        await sendTelegramMessage(targetIdString, `🏁 <b>L'administrateur a mis fin à la discussion.</b>\n\nLe bot reprend son fonctionnement normal. Tapez /start pour voir le menu.`);
        
        await cleanupUserChat(ctx);
        return showAdminMenu(ctx, true);
    });

    bot.action('user_chat_reply_admin', async (ctx) => {
        const userId = String(ctx.from.id);
        const userKey = `telegram_${userId}`;
        awaitingUserSupportReply.set(userKey, true);
        await ctx.answerCbQuery();
        return ctx.reply(`✍️ <b>RÉPONSE À L'ADMIN</b>\n\nEnvoyez votre message ci-dessous (texte, photo ou vidéo).\nChaque message sera transmis à l'administration.\n\n<i>Tapez /end pour quitter le mode discussion.</i>`, 
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🛑 Arrêter la discussion', callback_data: 'cancel_user_support' }]] } }
        );
    });

    bot.action('cancel_user_support', async (ctx) => {
        const userId = String(ctx.from.id);
        const userKey = `telegram_${userId}`;
        activeUserSessions.delete(userKey);
        awaitingUserSupportReply.delete(userKey);
        await ctx.answerCbQuery('Discussion terminée.');
        await cleanupUserChat(ctx);
        return ctx.reply('🏁 <b>Discussion terminée.</b>\n\nLe bot reprend son fonctionnement normal.', { parse_mode: 'HTML' });
    });

    bot.action('help_chat_admin', async (ctx) => {
        await ctx.answerCbQuery();
        const settings = await getAppSettings();
        const userId = `telegram_${ctx.from.id}`;
        
        await notifyAdmins(bot, `💬 <b>CONTACT ADMIN SOLLICITÉ</b>\n\n👤 Client : ${ctx.from.first_name} (@${ctx.from.username || 'Inconnu'})\n🆔 ID : <code>${userId}</code>\n\n<i>Vous pouvez cliquer sur le bouton ci-dessous pour lui répondre directement.</i>`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '💬 Lui répondre', callback_data: `admin_chat_user_${userId}` }]] }
        });

        const b = [[{ text: '💬 Envoyer ma réponse via le bot', callback_data: 'user_chat_reply_admin' }]];
        if (settings.private_contact_url) b.push([{ text: '📲 Telegram : Admin', url: settings.private_contact_url }]);
        b.push([{ text: '◀️ Retour', callback_data: 'main_menu' }]);

        return safeEdit(ctx, t(ctx, 'msg_support_sent', `💬 <b>Besoin d'un admin ?</b>\n\nVotre demande a été remontée aux administrateurs. Ils reviendront vers vous via le bot sous peu.\n\nVous pouvez aussi nous contacter directement :`), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: b }
        });
    });

    bot.command('chat', async (ctx) => {
        if (!(await hasAccess(ctx))) return;
        const args = ctx.message.text.split(' ');
        if (args.length < 2) return ctx.reply('❌ Usage: /chat <ID_UTILISATEUR>');
        
        const targetIdString = args[1];
        const adminId = String(ctx.from.id);
        awaitingAdminChat.set(adminId, targetIdString);
        activeAdminSessions.set(adminId, true);
        
        await cleanupUserChat(ctx);
        return ctx.reply(`💬 <b>CONVERSATION INITIALISÉE</b>\n\nVous discutez avec <code>${targetIdString}</code>.\n\nTous vos messages lui seront relayés.`,
            Markup.inlineKeyboard([[Markup.button.callback('🛑 TERMINER', `admin_chat_end_${targetIdString}`)]])
        );
    });

    bot.action(/^admin_user_edit_(balance|points)_(.+)$/, async (ctx) => {
        const [field, uid] = ctx.match.slice(1);
        await ctx.answerCbQuery();
        pendingUserEdit.set(ctx.from.id, { field, uid });
        const label = field === 'balance' ? 'le nouveau solde (€)' : 'le nouveau nombre de points';
        await safeEdit(ctx, `✏️ <b>Modification ${field}</b>\n\nEntrez ${label} pour cet utilisateur :`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Annuler', `admin_user_view_${uid}`)]]));
    });

    bot.action(/^admin_user_toggle_livreur_(.+)$/, async (ctx) => {
        const uid = ctx.match[1];
        const u = await getUser(uid);
        if (u) {
            const { setLivreurStatus, getAppSettings } = require('../services/database');
            const { sendMessageToUser } = require('../services/notifications');
            
            const newStatus = !u.is_livreur;
            await setLivreurStatus(u.platform_id, u.platform, newStatus);
            await ctx.answerCbQuery(newStatus ? '🚴 Livreur Activé' : '👤 Livreur Retiré');
            
            if (newStatus) {
                await sendMessageToUser(uid, `🚴 <b>PROMOTION LIVREUR !</b>\n\nVous avez été promu au rang de livreur par l'administration.\n\nCliquez sur /start pour accéder à votre interface de livraison.`);
            } else {
                await sendMessageToUser(uid, `👤 <b>MISE À JOUR DE RÔLE</b>\n\nVotre rôle de livreur a été révoqué par l'administration. Vous repassez en mode Client. Cliquez sur /start pour voir le menu.`);
            }

            try {
                const targetChatId = u.platform_id.replace('telegram_', '');
                const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
                const settings = await getAppSettings();
                if (newStatus) {
                    const langCode = u?.language_code || 'fr';
                    const livreurUrl = (settings.mini_app_url ? `${settings.mini_app_url}/livreur` : `${baseDomain}/livreur`) + `?lang=${langCode}`;
                    await ctx.telegram.setChatMenuButton(targetChatId, {
                        type: 'web_app',
                        text: `${settings.ui_icon_livreur || '🚴'} Livreur`,
                        web_app: { url: livreurUrl }
                    }).catch(() => {});
                } else {
                    const langCode = u?.language_code || 'fr';
                    const catalogUrl = (settings.mini_app_url ? `${settings.mini_app_url}/catalog` : `${baseDomain}/catalog`) + `?lang=${langCode}`;
                    await ctx.telegram.setChatMenuButton(targetChatId, {
                        type: 'web_app',
                        text: `${settings.ui_icon_catalog || '🛍️'} Catalogue`,
                        web_app: { url: catalogUrl }
                    }).catch(() => {});
                }
            } catch (e) {
                console.error('Error updating menu button on livreur status change:', e.message);
            }
            
            return renderUserView(ctx, uid).catch(() => {});
        }
    });

    bot.action('admin_livreurs', async (ctx) => {
        await ctx.answerCbQuery();
        const livreurs = await getAllLivreurs();
        if (livreurs.length === 0) return safeEdit(ctx, '🚴 Aucun livreur.', Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_menu')]]));

        let text = `🚴 <b>Gestion des Livreurs (${livreurs.length})</b>\n\n`;
        const buttons = livreurs.map(l => {
            const icon = l.is_available ? '🟢' : '🔴';
            return [Markup.button.callback(`${icon} ${l.first_name} — ${l.order_count || 0} livraisons`, `al_v_${l.id}`)];
        });
        buttons.push([Markup.button.callback('◀️ Retour', 'admin_menu')]);
        await safeEdit(ctx, text, Markup.inlineKeyboard(buttons));
    });

    bot.action(/^al_v_(.+)$/, async (ctx) => {
        const lid = ctx.match[1];
        const l = await getUser(lid);
        if (!l) return ctx.answerCbQuery('❌ Introuvable');
        await ctx.answerCbQuery();

        const msg = `🚴 <b>${l.first_name}</b> (@${l.username || '?'})\n\n` +
            `🆔 <code>${l.platform_id}</code>\n` +
            `🔘 Statut : ${l.is_available ? '🟢 DISPONIBLE' : '🔴 INDISPONIBLE'}\n` +
            `📦 Livraisons : ${l.order_count || 0}\n` +
            `💰 Solde : ${l.wallet_balance || 0}€`;

        const buttons = [
            [Markup.button.callback(l.is_available ? '🔴 Rendre Indisponible' : '🟢 Rendre Disponible', `al_t_${lid}`)],
            [Markup.button.callback('🚫 Retirer statut livreur', `admin_user_toggle_livreur_${lid}`)],
            [Markup.button.callback('◀️ Retour', 'admin_livreurs')]
        ];
        await safeEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    });

    bot.action(/^al_t_(.+)$/, async (ctx) => {
        const lid = ctx.match[1];
        const l = await getUser(lid);
        if (!l) return ctx.answerCbQuery('❌ Erreur');
        await setLivreurAvailability(lid, !l.is_available);
        await ctx.answerCbQuery(`✅ ${l.first_name} est maintenant ${!l.is_available ? 'disponible' : 'indisponible'}`);
        return bot.handleUpdate({ callback_query: { data: `al_v_${lid}`, from: ctx.from } });
    });

    bot.action('admin_products', async (ctx) => {
        await ctx.answerCbQuery();
        const products = await getProducts();
        const buttons = products.map(p => {
            return [Markup.button.callback(`${p.is_active ? '🟢' : '🔴'} ${p.name} - ${p.price}€`, `admin_prod_toggle_${p.id}`)];
        });
        buttons.push([Markup.button.callback('◀️ Retour', 'admin_menu')]);
        await safeEdit(ctx, `🛒 <b>Catalogue Produits</b>\nCliquez pour activer/désactiver :`, Markup.inlineKeyboard(buttons));
    });

    bot.action(/^admin_prod_toggle_(.+)$/, async (ctx) => {
        const pid = ctx.match[1];
        const products = await getProducts();
        const p = products.find(x => x.id === pid);
        if (p) {
            await saveProduct({ ...p, is_active: !p.is_active });
            await ctx.answerCbQuery(`✅ ${p.name} est maintenant ${!p.is_active ? 'Actif' : 'Inactif'}`);
            const updated = await getProducts();
            const buttons = updated.map(up => [Markup.button.callback(`${up.is_active ? '🟢' : '🔴'} ${up.name} - ${up.price}€`, `admin_prod_toggle_${up.id}`)]);
            buttons.push([Markup.button.callback('◀️ Retour', 'admin_menu')]);
            await safeEdit(ctx, `🛒 <b>Catalogue Produits</b>`, Markup.inlineKeyboard(buttons));
        }
    });

    bot.command('broadcast', async (ctx) => {
        if (!(await isAdmin(ctx))) return;
        const msg = ctx.message.text.split(' ').slice(1).join(' ');
        if (!msg) return ctx.reply('❌ Usage: /broadcast message');
        const res = await broadcastMessage('users', msg);
        return ctx.reply(`✅ Diffusé à ${res.success} membres.`);
    });

    bot.action(/^admin_user_block_(.+)$/, async (ctx) => {
        const uid = ctx.match[1];
        const u = await getUser(uid);
        if (!u) return ctx.answerCbQuery('❌ Utilisateur introuvable');

        const { markUserBlocked, markUserUnblocked } = require('../services/database');

        if (u.is_blocked) {
            await markUserUnblocked(uid);
            await ctx.answerCbQuery('✅ Utilisateur débloqué');
        } else {
            await markUserBlocked(uid, true);
            await ctx.answerCbQuery('🚫 Utilisateur bloqué');
        }

        return renderUserView(ctx, uid).catch(() => {});
    });

    bot.action(/^admin_user_toggle_(admin|moderator)_(.+)$/, async (ctx) => {
        const [role, uid] = ctx.match.slice(1);
        const u = await getUser(uid);
        if (!u) return ctx.answerCbQuery('❌ Utilisateur introuvable');

        const { setAdminStatus, setModeratorStatus, getAppSettings, updateAppSettings } = require('../services/database');
        
        if (role === 'admin') {
            const newState = !u.is_admin;
            await setAdminStatus(uid, newState);
            
            // Forcer le rafraîchissement du cache pour cet utilisateur
            if (u.platform_id) clearAuthCache(u.platform_id);
            
            await ctx.answerCbQuery(newState ? '👑 Promu Admin' : '🚫 Admin retiré');

            try {
                const targetChatId = u.platform_id.replace('telegram_', '');
                const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
                const settings = await getAppSettings();
                if (newState) {
                    const langCode = u?.language_code || 'fr';
                    const dashboardUrl = (settings.mini_app_url ? `${settings.mini_app_url}/dashboard` : `${baseDomain}/dashboard`) + `?lang=${langCode}`;
                    await ctx.telegram.setChatMenuButton(targetChatId, {
                        type: 'web_app',
                        text: `${settings.ui_icon_admin || '🛠️'} Dashboard`,
                        web_app: { url: dashboardUrl }
                    }).catch(() => {});
                } else {
                    const langCode = u?.language_code || 'fr';
                    const catalogUrl = (settings.mini_app_url ? `${settings.mini_app_url}/catalog` : `${baseDomain}/catalog`) + `?lang=${langCode}`;
                    await ctx.telegram.setChatMenuButton(targetChatId, {
                        type: 'web_app',
                        text: `${settings.ui_icon_catalog || '🛍️'} Catalogue`,
                        web_app: { url: catalogUrl }
                    }).catch(() => {});
                }
            } catch (e) {
                console.error('Error updating menu button on admin status change:', e.message);
            }
        } else {
            const newState = !u.is_moderator;
            await setModeratorStatus(uid, newState);
            
            // Forcer le rafraîchissement du cache
            if (u.platform_id) clearAuthCache(u.platform_id);
            
            await ctx.answerCbQuery(newState ? '🛂 Modo Promu' : '🚫 Modo Retiré');
        }

        return renderUserView(ctx, uid);
    });

    bot.action('admin_settings', async (ctx) => {
        if (!(await isAdmin(ctx))) return ctx.answerCbQuery('❌ Réservé aux Admins');
        await ctx.answerCbQuery();
        const settings = await getAppSettings();
        const msg = `⚙️ <b>Paramétrage du Bot</b>\n\n` +
            `• Nom : <b>${settings.bot_name || 'Non défini'}</b>\n` +
            `• Mode Maintenance : ${settings.maintenance_mode ? '🔴 OUI' : '🟢 NON'}\n` +
            `• Validation Nouveaux Clients : ${settings.manual_validation ? '🔒 MANUELLE' : '🔓 AUTO'}\n` +
            `• Points/Achat : <b>${settings.points_per_order || 0}</b>\n` +
            `• Contact Admin : ${settings.private_contact_url ? '✅ OK' : '❌'}`;

        const buttons = [
            [Markup.button.callback('🔧 Modifier Nom Bot', 'admin_set_bot_name'), Markup.button.callback(settings.maintenance_mode ? '🟢 Activer Bot' : '🔴 Maintenance', 'admin_toggle_maintenance')],
            [Markup.button.callback(settings.manual_validation ? '🔓 Passer en Auto' : '🔒 Passer en Manuel', 'admin_toggle_validation')],
            [Markup.button.callback('📲 Modifier URL Contact TG', 'admin_set_contact_url')],
            [Markup.button.callback('◀️ Retour', 'admin_menu')]
        ];
        await safeEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    });

    bot.action('admin_toggle_welcome', async (ctx) => {
        const s = await getAppSettings();
        const newState = !(s.welcome_message_enabled !== false);
        await updateAppSettings({ welcome_message_enabled: newState });
        await ctx.answerCbQuery(`✅ Message de bienvenue ${newState ? 'Activé' : 'Désactivé'}`);
        return showAdminMenu(ctx, true);
    });

    bot.action('admin_toggle_maintenance', async (ctx) => {
        const s = await getAppSettings();
        const newState = !s.maintenance_mode;
        await updateAppSettings({ maintenance_mode: newState });
        await ctx.answerCbQuery(`✅ Maintenance ${newState ? 'Activée' : 'Désactivée'}`);
        await notifyAdmins(bot, `⚙️ <b>MODIFICATION PARAMÈTRE</b>\n\nNom : Maintenance\nNouveau statut : <b>${newState ? 'ACTIVÉE' : 'DÉSACTIVÉE'}</b>\nPar : ${ctx.from.first_name}`);
        return showAdminMenu(ctx, true);
    });

    bot.action(/admin_set_(bot_name|contact_url)/, async (ctx) => {
        const field = ctx.match[1];
        await ctx.answerCbQuery();
        pendingSettingEdit.set(ctx.from.id, field);
        await safeEdit(ctx, `✍️ <b>Modification paramètre</b>\n\nVeuillez envoyer la nouvelle valeur pour <code>${field}</code> :`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Annuler', 'admin_settings')]]));
    });

    // Gestion list_admins (+/-)
    bot.action('admin_manage_list', async (ctx) => {
        await ctx.answerCbQuery();
        const s = await getAppSettings();
        const admins = Array.isArray(s.list_admins) ? s.list_admins : [];

        let msg = `👥 <b>Gestion des administrateurs</b>\n\n` +
            `Cliquez sur <b>(-)</b> pour supprimer un admin,\nou sur <b>(+)</b> pour en ajouter un nouveau via son ID.\n\n`;

        const buttons = admins.map(id => [
            Markup.button.callback(`👤 Admin ${id}`, 'none'),
            Markup.button.callback('❌ (-)', `admin_remove_${id}`)
        ]);

        buttons.push([Markup.button.callback('➕ AJOUTER UN ADMIN (+)', 'admin_add_prompt')]);
        buttons.push([Markup.button.callback('◀️ Retour', 'admin_settings')]);

        await safeEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    });

    bot.action('admin_add_prompt', async (ctx) => {
        await ctx.answerCbQuery();
        pendingAdminAdd.set(ctx.from.id, true);
        await safeEdit(ctx, `📌 <b>Ajout Administrateur</b>\n\nEnvoyez l'ID Telegram de la personne (ex: 12345678) :`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Annuler', 'admin_manage_list')]]));
    });

    // Suppression d'admin
    bot.action(/^admin_remove_(.+)$/, async (ctx) => {
        const targetId = ctx.match[1];
        const s = await getAppSettings();
        let admins = Array.isArray(s.list_admins) ? s.list_admins : [];
        admins = admins.filter(id => id !== targetId);
        await updateAppSettings({ list_admins: admins });
        await ctx.answerCbQuery('✅ Admin supprimé');
        await notifyAdmins(bot, `👤 <b>ADMIN SUPPRIMÉ</b>\n\nID : <code>${targetId}</code>\nPar : ${ctx.from.first_name}`);
        return bot.handleUpdate({ callback_query: { data: 'admin_manage_list', from: ctx.from } });
    });

    // On-onglet des fonctionnalités (Menu principal)
    bot.action('admin_features', async (ctx) => {
        await ctx.answerCbQuery();
        const msg = `✨ <b>GUIDE DES FONCTIONNALITÉS</b>\n\n` +
            `Explorez chaque section du bot en détail.\nCliquez sur un onglet pour en savoir plus :`;

        await safeEdit(ctx, msg, Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Boutique & Commandes', 'feat_catalog')],
            [Markup.button.callback('🚴 Équipe de Livraison', 'feat_livreur')],
            [Markup.button.callback('💬 Communication Support', 'feat_chat')],
            [Markup.button.callback('🎁 Fidélité & Parrainage', 'feat_fidelity')],
            [Markup.button.callback('📣 Diffusion & Statistiques', 'feat_broadcast')],
            [Markup.button.callback('⚙️ Gestion Système', 'feat_settings')],
            [Markup.button.callback('◀️ Menu Admin', 'admin_menu')]
        ]));
    });

    // --- Sous-pages Fonctionnalités ---
    bot.action('feat_catalog', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `🛒 <b>EXPÉRIENCE CLIENT & BOUTIQUE</b>\n\n` +
            `<b>Côté Client :</b>\n` +
            `• <b>Navigation Intuitive :</b> Les produits sont organisés par catégories pour une recherche rapide.\n` +
            `• <b>Processus Achat :</b> Sélection du produit, choix de la quantité et saisie de l'adresse en quelques secondes.\n` +
            `• <b>Flexibilité :</b> Possibilité de planifier une livraison à l'avance ou de commander ASAP.\n\n` +
            `<b>Côté Administration :</b>\n` +
            `• <b>Pilotage Stock :</b> Gérez votre catalogue en temps réel depuis le Dashboard Web ou ce bot.\n` +
            `• <b>Suivi Commandes :</b> Visualisez chaque étape d'une vente, de la validation à la remise en main propre.\n` +
            `• <b>Historique Complet :</b> Gardez une trace de chaque transaction pour votre comptabilité.`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_features')]])
        );
    });

    bot.action('feat_livreur', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `🚴 <b>GESTION DE L'ÉQUIPE LOGISTIQUE</b>\n\n` +
            `<b>L'Interface Livreur :</b>\n` +
            `• <b>Statut Temps Réel :</b> Vos livreurs activent leur disponibilité d'un simple clic.\n` +
            `• <b>Affectation Optimisée :</b> Les livreurs voient les commandes disponibles dans leur secteur.\n` +
            `• <b>Tracking & ETA :</b> Communication directe de l'estimation d'arrivée au client.\n\n` +
            `<b>Processus Livraison :</b>\n` +
            `1. <b>Acceptation :</b> Le livreur valide la prise en charge de la mission.\n` +
            `2. <b>Notification :</b> Le client est informé instantanément du départ de sa commande.\n` +
            `3. <b>Finalisation :</b> Une fois livré, le système archive la course et met à jour les stats.`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_features')]])
        );
    });

    bot.action('feat_chat', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `💬 <b>CHANNELS DE COMMUNICATION</b>\n\n` +
            `<b>Liaison Client ↔ Livreur :</b>\n` +
            `• <b>Chat Sécurisé :</b> Un canal de discussion éphémère s'ouvre pour chaque commande active.\n` +
            `• <b>Confidentialité :</b> Les échanges sont relayés par le bot ; aucune donnée personnelle n'est divulguée.\n\n` +
            `<b>Assistance Admin :</b>\n` +
            `• <b>Relais Support :</b> Le menu "Aide" permet aux clients d'ouvrir un ticket support qui vous est directement transmis.\n` +
            `• <b>Récompense de Retard :</b> Le système permet de notifier les retards et de maintenir une relation de confiance.`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_features')]])
        );
    });

    bot.action('feat_fidelity', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `🎁 <b>FIDÉLISATION & PARRAINAGE D'ÉLITE</b>\n\n` +
            `<b>Programme de Points :</b>\n` +
            `• <b>Génération de Valeur :</b> Chaque commande rapporte des points convertibles en crédit d'achat.\n` +
            `• <b>Automatisation :</b> Les paliers de bonus sont gérés par le système pour récompenser les clients récurrents.\n\n` +
            `<b>L'Écosystème de Parrainage :</b>\n` +
            `• <b>Viralité :</b> Vos clients fidèles deviennent vos ambassadeurs grâce à leur lien d'invitation unique.\n` +
            `• <b>Récompense Double :</b> Le parrain et le filleul reçoivent une gratification immédiate dès la première vente.`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_features')]])
        );
    });

    bot.action('feat_broadcast', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `📣 <b>DIFFUSION & ANALYTICS</b>\n\n` +
            `<b>Campagnes de Diffusion :</b>\n` +
            `• <b>Mass Messaging :</b> envoyez des annonces illustrées (textes, photos, vidéos) à l'ensemble de votre base.\n` +
            `• <b>Ciblage Précis :</b> Utilisez le Dashboard Web pour piloter vos envois de manière groupée.\n\n` +
            `<b>Décision par la Donnée :</b>\n` +
            `• <b>KPIs Stratégiques :</b> Suivez votre CA, votre panier moyen et vos performances logistiques.\n` +
            `• <b>Cartographie :</b> Identifiez vos villes et secteurs les plus rentables pour optimiser vos tournées.`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_features')]])
        );
    });

    bot.action('feat_stats', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `📊 <b>STATISTIQUES & DASHBOARD</b>\n\n` +
            `<b>Onglet Statistiques (Bot) :</b>\n` +
            `• Nombre total d'utilisateurs et utilisateurs actifs\n` +
            `• Chiffre d'affaires total et nombre de commandes\n` +
            `• Nombre de livreurs actifs\n\n` +
            `<b>Onglet Analytiques (Bot) :</b>\n` +
            `• CA par jour, semaine, mois\n` +
            `• Top produits vendus\n` +
            `• Temps moyen de livraison\n\n` +
            `<b>Dashboard Web :</b>\n` +
            `• Vue d'ensemble avec compteurs en temps réel\n` +
            `• Onglet Commandes : liste, filtres, détails\n` +
            `• Onglet Utilisateurs : recherche, profils, bannissement\n` +
            `• Onglet Livreurs : gestion, historique par livreur\n` +
            `• Onglet Produits : CRUD complet avec photos\n` +
            `• Onglet Diffusion : envoi + historique\n` +
            `• Onglet Paramètres : personnalisation complète du bot`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour Fonctionnalités', 'admin_features')]])
        );
    });

    bot.action('feat_users', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `👥 <b>GESTION UTILISATEURS</b>\n\n` +
            `<b>Depuis le Bot :</b>\n` +
            `• "Gestion Utilisateurs" : rechercher un utilisateur par nom ou ID\n` +
            `• Voir le profil complet (commandes, points, wallet)\n` +
            `• Bloquer / Débloquer un utilisateur\n\n` +
            `<b>Depuis le Dashboard :</b>\n` +
            `• Liste complète avec recherche\n` +
            `• Modifier le solde, les points, le statut livreur\n` +
            `• Voir l'historique des commandes par utilisateur\n\n` +
            `<b>Blocage :</b>\n` +
            `• Un utilisateur bloqué ne peut plus interagir avec le bot\n` +
            `• Il reçoit un message "Accès refusé" s'il essaie\n` +
            `• Il ne reçoit plus les diffusions`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour Fonctionnalités', 'admin_features')]])
        );
    });

    bot.action('feat_settings', async (ctx) => {
        await ctx.answerCbQuery();
        await safeEdit(ctx,
            `⚙️ <b>PARAMÈTRES DU BOT</b>\n\n` +
            `<b>Personnalisation visuelle :</b>\n` +
            `• Icônes de chaque bouton du menu (émojis)\n` +
            `• Libellés des boutons (noms affichés)\n` +
            `• Message de bienvenue pour les nouveaux utilisateurs\n` +
            `• Modes de paiement affichés dans le message de bienvenue\n\n` +
            `<b>Fidélité & Parrainage :</b>\n` +
            `• Ratio points/euro, seuil de conversion\n` +
            `• Bonus parrainage, bonus fidélité\n` +
            `• Plafond d'utilisation du wallet\n\n` +
            `<b>Liens & Contact :</b>\n` +
            `• URL du canal Telegram\n` +
            `• Lien de contact privé admin\n` +
            `• Description du bot (carte de partage Telegram)\n\n` +
            `<b>Accès :</b>\n` +
            `• ID Telegram de l'admin (notifications)\n` +
            `• Mot de passe du dashboard web\n` +
            `• Tous les paramètres sont modifiables en temps réel depuis le dashboard`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour Fonctionnalités', 'admin_features')]])
        );
    });

    // Analytics rapide
    bot.action('admin_analytics', async (ctx) => {
        await ctx.answerCbQuery();
        const analytics = await getOrderAnalytics();

        const topProducts = Object.entries(analytics.byProduct || {})
            .sort((a, b) => b[1].qty - a[1].qty).slice(0, 5)
            .map(([name, d]) => `  • ${name} : ${d.qty} vendus (${d.ca.toFixed(2)}€)`).join('\n');

        const msg = `📈 <b>Analytiques</b>\n\n` +
            `💰 CA Total : <b>${analytics.totalCA.toFixed(2)}€</b>\n` +
            `📦 Commandes livrées : ${analytics.totalOrders}\n` +
            `⏱ Temps moyen : ${analytics.avgDeliveryTime} min\n\n` +
            (topProducts ? `🏆 <b>Top Produits :</b>\n${topProducts}` : '');

        await safeEdit(ctx, msg, Markup.inlineKeyboard([[Markup.button.callback('◀️ Retour', 'admin_menu')]]));
    });

    // === MENU DES MODULES & SÉCURITÉ ===
    bot.action('admin_modules_menu', async (ctx) => {
        await ctx.answerCbQuery();
        const s = await getAppSettings();
        
        let msg = `🛠️ <b>Gestion des Modules & Sécurité</b>\n\n` +
            `Activez ou désactivez les fonctionnalités majeures en un clic.\n` +
            `<i>(Note : Ces changements sont appliqués immédiatement sur tous les bots)</i>`;
            
        const buttons = [
            [Markup.button.callback((s.auto_approve_new ? '🟢' : '🔴') + ' Approbation Auto', 'toggle_mod_auto_approve_new')],
            [Markup.button.callback((s.notify_on_approval !== false ? '🟢' : '🔴') + ' Notif. Approbation', 'toggle_mod_notify_on_approval')],
            [Markup.button.callback((s.priority_delivery_enabled ? '🟢' : '🔴') + ' Livr. Prioritaire', 'toggle_mod_priority_delivery_enabled')],
            [Markup.button.callback((s.enable_fidelity !== false ? '🟢' : '🔴') + ' Fidélité & Points', 'toggle_mod_enable_fidelity')],
            [Markup.button.callback((s.enable_referral !== false ? '🟢' : '🔴') + ' Parrainage', 'toggle_mod_enable_referral')],
            [Markup.button.callback('◀️ Menu Principal', 'admin_menu')]
        ];
        
        await safeEdit(ctx, msg, Markup.inlineKeyboard(buttons));
    });

    // Handler générique pour les toggles de modules
    bot.action(/^toggle_mod_(.+)$/, async (ctx) => {
        const key = ctx.match[1];
        const s = await getAppSettings();
        
        // Inversion de l'état (true -> false, false -> true)
        const current = s[key] !== undefined ? s[key] : true; 
        const newState = !current;
        
        const updates = {};
        updates[key] = newState;
        
        try {
            const { updateAppSettings } = require('../services/database');
            await updateAppSettings(updates);
            await ctx.answerCbQuery(`✅ ${key} : ${newState ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
            
            // Notification aux admins
            await notifyAdmins(bot, `🛠️ <b>MODIFICATION MODULE</b>\n\nModule : <code>${key}</code>\nNouveau statut : <b>${newState ? 'ACTIF 🟢' : 'INACTIF 🔴'}</b>\nPar : ${ctx.from.first_name}`);
            
            // Recharger le menu (en ré-émettant l'action)
            return bot.handleUpdate({ callback_query: { data: 'admin_modules_menu', from: ctx.from } });
        } catch (e) {
            console.error('[Module-Toggle] Error:', e.message);
            await ctx.answerCbQuery('❌ Erreur lors de la modification.', true);
        }
    });
}

module.exports = { setupAdminHandlers, isAdmin, initAdminState, clearAuthCache, awaitingUserSupportReply };
