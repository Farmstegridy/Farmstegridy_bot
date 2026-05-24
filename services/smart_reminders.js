const { translate } = require('./translator');
const { supabase } = require('../config/supabase');
const { getBotInstance } = require('./notifications');
const { getAppSettings, COL_USERS } = require('./database');
const { analyzeUserTimePattern, heavyRanker, generateDynamicMessage } = require('./x_engine');

/**
 * Analyse les commandes pour chaque utilisateur et envoie des rappels intelligents
 */
async function runSmartAnalysis() {
    try {
        const { data: users } = await supabase.from(COL_USERS).select('*');
        if (!users) return;

        const currentHour = new Date().getHours();
        const currentDay = new Date().getDay();
        const bot = getBotInstance();
        if (!bot) return;

        for (const user of users) {
            const history = user.data.view_history || [];
            
            // X-Engine: Time Prediction
            const timePattern = analyzeUserTimePattern(history);
            
            // Should we contact now? (1 hour before their usual time)
            let targetHour = timePattern.bestHour - 1;
            if (targetHour < 0) targetHour = 23;

            // Only send if it's the right time and we haven't sent a reminder today
            const lastReminder = user.data.last_x_reminder ? new Date(user.data.last_x_reminder).getDate() : null;
            const today = new Date().getDate();

            if (currentHour === targetHour && lastReminder !== today) {
                // X-Engine: Ranker & Templating
                const rankResult = heavyRanker(history, !user.data.has_ordered);
                const message = generateDynamicMessage(user, rankResult, timePattern);

                const tgId = String(user.id).replace('telegram_', '');
                const lang = user.data?.language || 'fr';
                if (lang !== 'fr') { message = await translate(message, lang).catch(() => message); }
                bot.telegram.sendMessage(tgId, message, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🚀 Ouvrir la Mini App', web_app: { url: (process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/catalog` : 'https://monshopbot-production.up.railway.app/catalog')) } }]]
                    }
                }).catch(() => {});

                // Update last reminder
                await supabase.from(COL_USERS).update({
                    data: { ...user.data, last_x_reminder: new Date().toISOString() }
                }).eq('id', user.id);
                
                console.log(`[X-Engine] Relance envoyée à ${user.id} (Rank: ${rankResult.category})`);
            }
        }
    } catch (e) {
        console.error('[X-Engine] Erreur CRON:', e);
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
            // Si le panier a plus de 15 minutes et n'a pas été notifié
            if (now - c.updated_at > 15 * 60 * 1000 && !c.notified) {
                const itemCount = c.cart.length;
                let msg = `🛒 <b>PANIER EN ATTENTE</b>\n\nHey ! Vous avez laissé <b>${itemCount} article(s)</b> dans votre panier. 😱\n\nIls vous attendent bien sagement. On valide la commande maintenant ?`;
                try {
                    const { data: userRow } = await supabase.from(COL_USERS).select('data').eq('id', userId).single();
                    const lang = userRow?.data?.language || 'fr';
                    if (lang !== 'fr') msg = await translate(msg, lang).catch(() => msg);
                } catch(e) {}
                
                const keyboard = {
                    inline_keyboard: [[{ text: '✅ Finaliser ma commande', web_app: { url: (process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/catalog` : 'https://monshopbot-production.up.railway.app/catalog')) } }]]
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
