const { getAppSettings } = require('./database');
const { registry } = require('../channels/ChannelRegistry');

// Résolution ultra-robuste de l'instance du bot Telegram
function getBotForNotification(providedBot = null) {
    if (providedBot && providedBot.telegram) return providedBot;
    
    // 1. Chercher dans le registre
    const tgChannel = registry.query('telegram');
    if (tgChannel && typeof tgChannel.getBotInstance === 'function') {
        const bot = tgChannel.getBotInstance();
        if (bot && bot.telegram) return bot;
    }

    // 2. Fallback via le singleton partagé
    try {
        const { getBotInstance } = require('../server');
        const fallback = getBotInstance();
        if (fallback && fallback.telegram) return fallback;
    } catch (e) {}

    return null;
}

/**
 * Notifier les administrateurs
 */
async function notifyAdmins(bot, message, options = {}) {
    console.log('[Notification-Admin] Appel reçu pour alerte admin');
    try {
        if (typeof bot === 'string') {
            options = message || {};
            message = bot;
            bot = null;
        }

        const settings = await getAppSettings();
        if (!settings) {
            console.error('[Notification-Admin] Impossible de charger les paramètres DB');
            return;
        }

        // --- Parsing des IDs Administrateurs ---
        let admins = [];
        const dbRaw = settings.admin_telegram_id;
        console.log('[Notification-Admin] rawAdmins en base:', typeof dbRaw, dbRaw);
        
        if (Array.isArray(dbRaw)) {
            admins = dbRaw.map(String);
        } else if (typeof dbRaw === 'string') {
            // Nettoyage complet (espaces, guillemets, crochets JSON mal formés)
            admins = dbRaw.replace(/[\[\]"']/g, '').split(/[\s,]+/).filter(Boolean);
        } else if (dbRaw && typeof dbRaw === 'object') {
             admins = Object.values(dbRaw).map(String);
        } else if (dbRaw) {
            admins = [String(dbRaw)];
        }

        const envAdmin = process.env.ADMIN_TELEGRAM_ID;
        
        // --- Récupération dynamique depuis la DB ---
        let dynamicAdmins = [];
        let dynamicMods = [];
        try {
            const { getAllAdmins, getAllModerators } = require('./database');
            const [dbAdmins, dbMods] = await Promise.all([getAllAdmins(), getAllModerators()]);
            dynamicAdmins = dbAdmins.map(u => u.platform_id).filter(Boolean);
            dynamicMods = dbMods.map(u => u.platform_id).filter(Boolean);
        } catch (dbErr) {
            console.error('[Notification-Admin] Erreur récupération roles DB:', dbErr.message);
        }

        // Par défaut, on ne notifie QUE les admins. 
        // Les modos sont notifiés seulement si explicitement demandé (ex: approbation user)
        const targetAdmins = [...admins, envAdmin, ...dynamicAdmins];
        if (options.includeModerators) {
            targetAdmins.push(...dynamicMods);
        }

        const allAdmins = [...new Set(targetAdmins.filter(Boolean))];

        if (allAdmins.length === 0) {
            console.warn('[Notification-Admin] AUCUN admin trouvé (Base + ENV vides)');
            return;
        }

        console.log(`[Notification-Admin] 🚀 Liaison vers ${allAdmins.length} admins: ${allAdmins.join(', ')}`);

        const sendPromises = allAdmins.map(async (adminId) => {
            const idStr = String(adminId).trim();
            if (!idStr) return null;
            // Normaliser l'ID (ajouter telegram_ si besoin pour le dispatcheur interne)
            const finalId = (idStr.includes('_') || idStr.includes('@')) ? idStr : `telegram_${idStr}`;
            try {
                const res = await sendMessageToUser(finalId, message, options, bot);
                if (res) console.log(`[Notification-Admin] ✅ Envoyé à ${finalId}`);
                else console.warn(`[Notification-Admin] ⚠️ Échec (résultat null) pour ${finalId}`);
                return res;
            } catch (err) {
                console.error(`[Notification-Admin] ❌ Crash pour ${finalId}:`, err.message);
                return null;
            }
        });
        return await Promise.allSettled(sendPromises);
    } catch (e) {
        console.error("❌ notifyAdmins CRITICAL:", e.message);
    }
}

/**
 * Notifier les livreurs
 */
async function notifyLivreurs(bot, message, options = {}) {
    try {
        const { getAllLivreurs } = require('./database');
        const allLivreurs = await getAllLivreurs();
        if (!allLivreurs || allLivreurs.length === 0) {
            console.log(`[Notification-Livreurs] Aucun livreur disponible`);
            return;
        }

        console.log(`[Notification-Livreurs] 🚀 Diffusion vers ${allLivreurs.length} livreurs...`);
        
        const sendPromises = allLivreurs.map(async (livreur) => {
            const userId = livreur.id || (livreur.telegram_id ? `telegram_${livreur.telegram_id}` : null);
            if (!userId) return null;
            try {
                return await sendMessageToUser(userId, message, options, bot);
            } catch (err) {
                console.error(`[Notification-Livreurs] ❌ Échec pour ${userId}:`, err.message);
                return null;
            }
        });
        return await Promise.allSettled(sendPromises);
    } catch (e) {
        console.error("❌ notifyLivreurs FATAL:", e.message);
    }
}

async function notifySuppliers(bot, cart, orderId, address, settings = null, isFirstOrder = false) {
    try {
        const { getSupplier, markOrderSupplierNotified, getProducts } = require('./database');
        const { esc } = require('./utils');

        if (!settings) settings = await getAppSettings();
        const cartItems = Array.isArray(cart) ? cart : [cart];

        // Charger les produits une seule fois pour lookup
        let allProducts = null;

        for (const item of cartItems) {
            const sid = item.supplier_id || item.product?.supplier_id;
            if (sid) {
                const supplier = await getSupplier(sid);
                if (supplier && supplier.telegram_id) {
                    // Résoudre le nom du produit depuis le cache ou le panier
                    let prodName = item.productName || 'Produit';
                    if (item.productId) {
                        try {
                            if (!allProducts) allProducts = await getProducts();
                            const found = allProducts.find(p => String(p.id) === String(item.productId));
                            if (found) prodName = found.name;
                        } catch (e) { /* fallback au nom du panier */ }
                    }

                    const isRetail = !orderId.startsWith('mpo_');
                    const platformIcon = isRetail ? (orderId.includes('_') ? '🟢' : '🔵') : '🏪';
                    const orderType = isRetail ? 'CLIENT' : 'ADMIN';

                    const badge = isFirstOrder ? "\n🔥 <b>[ NOUVEAU CLIENT ]</b> 🔥\n" : "";
                    const supplierMsg = `${platformIcon} <b>NOUVELLE COMMANDE ${orderType}</b>` +
                        badge +
                        `\n\n📦 Produit : ${esc(prodName)} x${item.qty || 1}\n` +
                        `📍 Adresse : ${esc(address)}\n` +
                        `💰 Prix : ${item.price}€\n` +
                        `🔑 Commande : #${orderId.slice(-5)}`;

                    console.log(`[NotifySupplier] Sending notification to supplier ${supplier.name} for ${orderType} order #${orderId.slice(-5)}`);

                    const buttons = [];
                    if (isRetail) {
                        buttons.push([{ text: '✅ Accepter', callback_data: `retail_accept_${orderId}` }, { text: '❌ Refuser', callback_data: `retail_reject_${orderId}` }]);
                    }
                    buttons.push([{ text: '📋 Mes Commandes', callback_data: 'mp_my_orders' }]);
                    buttons.push([{ text: '🏪 Mon Magasin', callback_data: 'mp_my_shop' }]);

                    sendMessageToUser(`telegram_${supplier.telegram_id}`, supplierMsg, {
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    }, bot)
                        .then(() => {
                            console.log(`[NotifySupplier] ✅ Notification sent to ${supplier.name}`);
                            return markOrderSupplierNotified(orderId);
                        })
                        .catch((err) => {
                            console.error(`[NotifySupplier] ❌ Failed to notify ${supplier.name}:`, err.message);
                        });
                }
            }
        }
    } catch (e) {
        console.error("❌ notifySuppliers FATAL:", e.message);
    }
}

/**
 * Noyau d'envoi de message universel
 */
async function sendMessageToUser(userId, message, options = {}, providedBot = null) {
    const idStr = String(userId);
    const cleanId = idStr.replace('telegram_', '');

    try {
        let realBot = getBotForNotification(providedBot);
        if (!realBot || !realBot.telegram) {
            console.error(`[MSG-Gen] BOT INTROUVABLE pour notifier Telegram ${cleanId}`);
            return null;
        }

        console.log(`[MSG-Gen] Sending to ${cleanId} (raw: ${userId})`);

        const extra = { parse_mode: 'HTML' };
        if (options.reply_markup) {
             extra.reply_markup = options.reply_markup;
        } else if (options.inline_keyboard || options.keyboard) {
             extra.reply_markup = options;
        }

        if (options.parse_mode) extra.parse_mode = options.parse_mode;
        if (options.protect_content !== undefined) extra.protect_content = options.protect_content;

        let sent;
        try {
            if (options.photo) {
                sent = await realBot.telegram.sendPhoto(cleanId, options.photo, { caption: message, ...extra });
            } else if (options.video) {
                sent = await realBot.telegram.sendVideo(cleanId, options.video, { caption: message, ...extra });
            } else {
                sent = await realBot.telegram.sendMessage(cleanId, message, extra);
            }
        } catch (botErr) {
            console.error(`[MSG-Gen] Telegram API Error for ${cleanId}:`, botErr.message);
            if (options.photo || options.video) {
                console.warn(`[MSG-Gen] Fallback texte car média échoué pour ${cleanId}: ${botErr.message}`);
                sent = await realBot.telegram.sendMessage(cleanId, message || 'Média non disponible', extra);
            } else throw botErr;
        }

        if (sent && sent.message_id) {
            console.log(`[MSG-Gen] ✅ SUCCESS - Message ID ${sent.message_id} for ${cleanId}`);
            try {
                const { trackIntermediateMessage } = require('./utils');
                trackIntermediateMessage(userId, sent.message_id).catch(() => {});
                const { addMessageToTrack } = require('./database');
                addMessageToTrack(userId, sent.message_id, false).catch(() => {});
            } catch (e) {}
        }
        return sent;
    } catch (e) {
        console.error(`[MSG-ERR] ${userId}:`, e.message);
        return null;
    }
}

async function sendTelegramMessage(userId, message, options = {}) {
    return sendMessageToUser(userId, message, options);
}


async function notifyUsersOfRestock(telegramIds, productName) {
    if (!telegramIds || !telegramIds.length) return;
    const { bot } = require('../index');
    if (!bot) return;

    const message = `🎉 <b>Bonne nouvelle !</b>\n\nLe produit <b>${productName}</b> est de nouveau en stock !\nVous pouvez dès à présent le commander en ouvrant la Mini-App.`;

    let successCount = 0;
    for (const tid of telegramIds) {
        try {
            await bot.telegram.sendMessage(tid, message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '🛍️ Ouvrir le Shop', web_app: { url: (process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/catalog` : 'https://monshopbot-production.up.railway.app/catalog')) } }]]
                }
            });
            successCount++;
        } catch (e) {
            console.error(`[RESTOCK] Failed to send to ${tid}:`, e.message);
        }
    }
    console.log(`[RESTOCK] Notified ${successCount}/${telegramIds.length} users about ${productName}`);
}

module.exports = { notifyAdmins, notifyLivreurs, notifySuppliers, sendTelegramMessage, sendMessageToUser };
