const { supabase } = require('../config/supabase');
const { getBotInstance } = require('./notifications');
const { getAppSettings } = require('./database');

/**
 * Analyse les commandes pour chaque utilisateur et envoie des rappels intelligents
 */
async function runSmartAnalysis() {
    try {
        console.log('[SMART-ANALYSIS] Starting periodic order analysis...');
        
        // 1. Récupérer toutes les commandes des 30 derniers jours
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: orders, error } = await supabase
            .from('bot_orders')
            .select('*')
            .gte('created_at', thirtyDaysAgo.toISOString());

        if (error) throw error;
        if (!orders || orders.length === 0) return;

        // Groupement par utilisateur
        const userStats = {};
        orders.forEach(o => {
            if (!userStats[o.user_id]) userStats[o.user_id] = { products: {}, hours: [] };
            
            // Heure de commande
            const hour = new Date(o.created_at).getHours();
            userStats[o.user_id].hours.push(hour);

            // Produits
            try {
                let itemsList = null;
                if (o.cart) {
                    itemsList = typeof o.cart === 'string' ? JSON.parse(o.cart) : o.cart;
                } else if (o.items) {
                    itemsList = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
                }
                
                if (Array.isArray(itemsList)) {
                    itemsList.forEach(it => {
                        const name = it.productName || it.name || it.id;
                        if (name) userStats[o.user_id].products[name] = (userStats[o.user_id].products[name] || 0) + 1;
                    });
                } else if (o.product_name) {
                    const parts = o.product_name.split(',');
                    parts.forEach(p => {
                        const cleanName = p.split(' (x')[0].split('\n')[0].trim();
                        if (cleanName) userStats[o.user_id].products[cleanName] = (userStats[o.user_id].products[cleanName] || 0) + 1;
                    });
                }
            } catch(e) {}
        });

        const bot = getBotInstance();
        if (!bot) return;

        // Analyse et envoi
        for (const userId in userStats) {
            const stats = userStats[userId];
            
            // Produit favori
            let favorite = null;
            let maxCount = 0;
            for (const p in stats.products) {
                if (stats.products[p] > maxCount) {
                    maxCount = stats.products[p];
                    favorite = p;
                }
            }

            // Heure favorite (moyenne)
            const avgHour = Math.round(stats.hours.reduce((a, b) => a + b, 0) / stats.hours.length);
            const currentHour = new Date().getHours();

            // Si c'est l'heure de sa commande habituelle et qu'il a un produit favori
            if (currentHour === avgHour && favorite && maxCount >= 2) {
                console.log(`[SMART-REMINDER] Sending recommendation to ${userId} for ${favorite}`);
                const msg = `🌟 <b>CONSEIL VIP</b>\n\nOn a remarqué que vous adorez le <b>${favorite}</b> à cette heure-ci ! 😋\n\nEnvie de vous faire plaisir ? On s'occupe de tout en un clic sur la Mini App ! 💨`;
                
                const keyboard = {
                    inline_keyboard: [[{ text: '🛍️ Ouvrir la Mini App', web_app: { url: process.env.WEBAPP_URL || '' } }]]
                };

                bot.telegram.sendMessage(userId.replace('telegram_', ''), msg, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
            }
        }
    } catch (e) {
        console.error('[SMART-ANALYSIS] Error:', e.message);
    }
}

/**
 * Gère les paniers abandonnés
 */
async function checkAbandonedCarts() {
    try {
        const { data: carts, error } = await supabase
            .from('bot_settings')
            .select('data')
            .eq('key', 'active_carts')
            .single();

        if (error || !carts) return;
        const allCarts = carts.data || {};
        const now = Date.now();
        const bot = getBotInstance();

        for (const userId in allCarts) {
            const c = allCarts[userId];
            // Si le panier a plus de 2 heures et n'a pas été notifié
            if (now - c.updated_at > 2 * 60 * 60 * 1000 && !c.notified) {
                const itemCount = c.cart.length;
                const msg = `🛒 <b>PANIER EN ATTENTE</b>\n\nHey ! Vous avez laissé <b>${itemCount} article(s)</b> dans votre panier. 😱\n\nIls vous attendent bien sagement. On valide la commande maintenant ?`;
                
                const { data: settingsData } = await supabase.from('bot_settings').select('data').eq('key', 'app_settings').maybeSingle();
                const settings = settingsData ? (settingsData.data || {}) : {};
                const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
                const catalogUrl = (settings.mini_app_url ? `${settings.mini_app_url}/catalog` : `${baseDomain}/catalog`) + `?v=${Date.now()}`;

                const keyboard = {
                    inline_keyboard: [[{ text: '✅ Finaliser ma commande', web_app: { url: catalogUrl } }]]
                };

                bot.telegram.sendMessage(userId.replace('telegram_', ''), msg, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
                allCarts[userId].notified = true;
            }
        }

        // Sauvegarder l'état
        await supabase.from('bot_settings').update({ data: allCarts }).eq('key', 'active_carts');
    } catch(e) {}
}

module.exports = { runSmartAnalysis, checkAbandonedCarts };
