const { supabase } = require('./database');
const { sendMessageToUser } = require('./notifications');

// Dynamic Text Generator (Anti-Fatigue)
const INTROS = [
    "Psst {first_name}... 👀",
    "Hello {first_name} ! 🌿",
    "Hey {first_name}, devinez quoi ? 🔥",
    "Salut {first_name} ! Prêt pour une petite douceur ? 😋",
    "Juste pour vous, {first_name}... 🤫"
];

const BODY_NEW_CLIENT = [
    "Vous avez jeté un œil à <b>{product}</b> récemment... Et franchement, vous avez bon goût ! 👌",
    "On a vu que <b>{product}</b> vous faisait de l'œil. C'est le moment de craquer !",
    "Si vous cherchez la crème de la crème, ne cherchez pas plus loin que <b>{product}</b>."
];

const BODY_VIP = [
    "On sait que vous adorez <b>{product}</b>. Bonne nouvelle : il est en stock et n'attend que vous ! 🛒",
    "C'est bientôt l'heure de votre session habituelle... <b>{product}</b> est prêt à partir en livraison express ! 💨",
    "Votre variété favorite, <b>{product}</b>, vient tout juste d'être réapprovisionnée. Premier arrivé, premier servi ! 🏆"
];

const OUTROS = [
    "\n\n👇 Ouvrez la Mini App en un clic :",
    "\n\n👇 Faites-vous plaisir maintenant :",
    "\n\n👇 Commandez discrètement ici :"
];

function generateDynamicText(firstName, productName, isVip) {
    const randomInt = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const intro = randomInt(INTROS).replace('{first_name}', firstName || 'l\'ami');
    const bodyArr = isVip ? BODY_VIP : BODY_NEW_CLIENT;
    const body = randomInt(bodyArr).replace('{product}', productName);
    const outro = randomInt(OUTROS);
    return `${intro}\n\n${body}${outro}`;
}

// Heavy Ranker: Scores products based on history and views
function rankProducts(orders, views) {
    const scores = {};

    // In-Network (Achats passés) - Weight: +5 par commande
    if (orders) {
        orders.forEach(o => {
            try {
                let itemsList = typeof o.cart === 'string' ? JSON.parse(o.cart) : o.cart;
                if (!itemsList && o.items) itemsList = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
                
                if (Array.isArray(itemsList)) {
                    itemsList.forEach(it => {
                        const name = it.productName || it.name;
                        if (name) scores[name] = (scores[name] || 0) + 5;
                    });
                } else if (o.product_name) {
                    const parts = o.product_name.split(',');
                    parts.forEach(p => {
                        const cleanName = p.split(' (x')[0].split('\n')[0].trim();
                        if (cleanName) scores[cleanName] = (scores[cleanName] || 0) + 5;
                    });
                }
            } catch(e) {}
        });
    }

    // Intention (Vues récentes) - Weight: +2 par vue
    if (views) {
        views.forEach(v => {
            if (v.productName) {
                // Récence: Vues des dernières 24h = +3, plus ancien = +1
                const age = Date.now() - v.viewed_at;
                const weight = age < 24 * 60 * 60 * 1000 ? 3 : 1;
                scores[v.productName] = (scores[v.productName] || 0) + weight;
            }
        });
    }

    // Sort descending
    const sorted = Object.keys(scores).map(k => ({ product: k, score: scores[k] })).sort((a, b) => b.score - a.score);
    return sorted;
}

// Get average order hour and preferred days (0-6)
function getTemporalAffinity(orders) {
    if (!orders || orders.length === 0) return null;
    
    const hours = [];
    const days = {};
    
    orders.forEach(o => {
        const d = new Date(o.created_at);
        hours.push(d.getHours());
        const day = d.getDay();
        days[day] = (days[day] || 0) + 1;
    });

    const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
    const preferredDay = Object.keys(days).sort((a, b) => days[b] - days[a])[0];

    return { avgHour, preferredDay: parseInt(preferredDay) };
}

// Main Engine Entry Point
async function runRecommendationEngine() {
    console.log('[RECOMMENDATION] Démarrage du Heavy Ranker Twitter-Style...');
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // 1. Fetch Orders
        const { data: orders } = await supabase
            .from('bot_orders')
            .select('*')
            .gte('created_at', thirtyDaysAgo.toISOString());

        // 2. Fetch Views
        const { data: viewsData } = await supabase.from('bot_settings').select('data').eq('key', 'user_views').maybeSingle();
        const allViews = viewsData ? (viewsData.data || {}) : {};

        // 3. Fetch Tracking State (Anti-Fatigue)
        const { data: fatigueData } = await supabase.from('bot_settings').select('data').eq('key', 'fatigue_tracker').maybeSingle();
        const fatigueTracker = fatigueData ? (fatigueData.data || {}) : {};

        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay();
        const todayStr = now.toISOString().split('T')[0];

        // Regrouper les commandes par user_id
        const userOrders = {};
        if (orders) {
            orders.forEach(o => {
                if (!userOrders[o.user_id]) userOrders[o.user_id] = [];
                userOrders[o.user_id].push(o);
            });
        }

        // Combiner tous les users (ceux qui ont commandé + ceux qui ont juste regardé)
        const allUserIds = new Set([...Object.keys(userOrders), ...Object.keys(allViews)]);

        let notificationsSent = 0;

        for (const userId of allUserIds) {
            const uOrders = userOrders[userId] || [];
            const uViews = allViews[userId] || [];
            
            // Fatigue Check: Ne pas envoyer plus d'un message par 48h
            const lastSent = fatigueTracker[userId];
            if (lastSent && (now.getTime() - lastSent) < 48 * 60 * 60 * 1000) {
                continue; // Skip, trop récent
            }

            const affinity = getTemporalAffinity(uOrders);
            let shouldSend = false;
            let isVip = uOrders.length > 0;

            if (affinity) {
                // Predictive Timing: 1 heure AVANT leur heure habituelle
                let targetHour = (affinity.avgHour - 1);
                if (targetHour < 0) targetHour = 23;
                
                // Si c'est l'heure cible (ou l'heure exacte s'ils commandent souvent à cette heure)
                if (currentHour === targetHour || currentHour === affinity.avgHour) {
                    shouldSend = true;
                }
                
                // Si le client ne commande que le vendredi (Day 5), commencer à le chauffer le jeudi (Day 4)
                if (affinity.preferredDay !== currentDay && affinity.preferredDay !== (currentDay + 1) % 7) {
                    // Si ce n'est pas son jour ni la veille, on réduit la probabilité d'envoi (seuil plus strict)
                    shouldSend = false;
                }
            } else {
                // Nouveau client (jamais commandé, mais a des vues)
                // Envoyer à des heures de pointe (ex: 18h)
                if (currentHour === 18 && uViews.length > 0) {
                    shouldSend = true;
                }
            }

            if (shouldSend) {
                const rankedProducts = rankProducts(uOrders, uViews);
                if (rankedProducts.length > 0) {
                    const topProduct = rankedProducts[0].product;
                    // Trouver le firstName (approximatif si on n'a pas accès à la DB users, on extrait via les orders si dispo)
                    const firstName = uOrders.length > 0 ? (uOrders[0].first_name || 'l\'ami') : 'l\'ami';
                    
                    const message = generateDynamicText(firstName, topProduct, isVip);
                    const keyboard = {
                        inline_keyboard: [[{ text: '🛍️ Ouvrir la Mini App', web_app: { url: process.env.WEBAPP_URL || '' } }]]
                    };

                    const tgId = userId.replace('telegram_', '');
                    await sendMessageToUser(tgId, message, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
                    
                    fatigueTracker[userId] = now.getTime();
                    notificationsSent++;
                }
            }
        }

        // Sauvegarder la fatigue
        if (notificationsSent > 0) {
            if (fatigueData) {
                await supabase.from('bot_settings').update({ data: fatigueTracker }).eq('key', 'fatigue_tracker');
            } else {
                await supabase.from('bot_settings').insert([{ key: 'fatigue_tracker', data: fatigueTracker }]);
            }
        }
        
    } catch (e) {
        console.error('[RECOMMENDATION] Erreur:', e.message);
    }
}

module.exports = { runRecommendationEngine, generateDynamicText, rankProducts };
