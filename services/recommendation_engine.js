const { supabase, decryptOrder } = require('./database');
const { sendMessageToUser } = require('./notifications');

// --- Dynamic Text Generator (Anti-Fatigue & Personalized) ---
const INTROS = [
    "Psst {first_name}... 👀",
    "Hello {first_name} ! 🌿",
    "Hey {first_name}, devinez quoi ? 🔥",
    "Salut {first_name} ! Prêt pour une petite douceur ? 😋",
    "Juste pour vous, {first_name}... 🤫",
    "On pensait justement à vous, {first_name} ! ✨"
];

const BODY_NEW_CLIENT = [
    "Vous avez jeté un œil à <b>{product}</b> récemment... Et franchement, vous avez bon goût ! 👌",
    "On a vu que <b>{product}</b> vous faisait de l'œil. C'est le moment de craquer !",
    "Si vous cherchez la crème de la crème, ne cherchez pas plus loin que <b>{product}</b>."
];

const BODY_RETENTION = [
    "On sait que vous adorez <b>{product}</b>. Bonne nouvelle : il est en stock et n'attend que vous ! 🛒",
    "C'est bientôt l'heure de votre session habituelle... <b>{product}</b> est prêt à partir en livraison express ! 💨",
    "Votre variété favorite, <b>{product}</b>, vient tout juste d'être réapprovisionnée. Premier arrivé, premier servi ! 🏆"
];

const BODY_AGGRESSIVE = [
    "Ça fait un petit moment qu'on ne vous a pas vu ! Votre <b>{product}</b> préféré vous attend, on vous prépare ça ? 🎁",
    "Ne ratez pas notre stock de <b>{product}</b>, les autres clients se l'arrachent en ce moment ! ⏳"
];

const OUTROS = [
    "\n\n👇 Ouvrez la Mini App en un clic :",
    "\n\n👇 Faites-vous plaisir maintenant :",
    "\n\n👇 Commandez discrètement ici :"
];

function generateDynamicText(firstName, productName, type) {
    const randomInt = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const intro = randomInt(INTROS).replace('{first_name}', firstName || 'l\'ami');
    
    let bodyArr = BODY_NEW_CLIENT;
    if (type === 'retention') bodyArr = BODY_RETENTION;
    else if (type === 'retention_aggressive') bodyArr = BODY_AGGRESSIVE;
    
    const body = randomInt(bodyArr).replace('{product}', productName);
    const outro = randomInt(OUTROS);
    return `${intro}\n\n${body}${outro}`;
}

// --- The "Graph" & Feature Engineering ---

function computeFavoriteHour(orders) {
    if (!orders || orders.length === 0) return 18;
    const hourCounts = {};
    orders.forEach(o => {
        const h = new Date(o.created_at).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    // Find mode (most frequent hour)
    let bestHour = 18;
    let maxCount = -1;
    for (const h in hourCounts) {
        if (hourCounts[h] > maxCount) {
            maxCount = hourCounts[h];
            bestHour = parseInt(h);
        }
    }
    return bestHour;
}

function computeOrderFrequencyMs(orders) {
    if (!orders || orders.length < 2) return 7 * 24 * 60 * 60 * 1000; // Default 7 days
    const sorted = [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let totalDiff = 0;
    for (let i = 1; i < sorted.length; i++) {
        totalDiff += (new Date(sorted[i].created_at) - new Date(sorted[i - 1].created_at));
    }
    return totalDiff / (sorted.length - 1);
}

// Heavy Ranker: Scores products based on history and views
function rankProducts(orders, views) {
    const scores = {};

    // In-Network (Achats passés) - Weight: +10 par commande
    if (orders) {
        orders.forEach(o => {
            try {
                let itemsList = typeof o.cart === 'string' ? JSON.parse(o.cart) : o.cart;
                if (!itemsList && o.items) itemsList = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
                
                if (Array.isArray(itemsList)) {
                    itemsList.forEach(it => {
                        const name = it.productName || it.name;
                        if (name) scores[name] = (scores[name] || 0) + 10;
                    });
                } else if (o.product_name) {
                    const parts = o.product_name.split(',');
                    parts.forEach(p => {
                        const cleanName = p.split(' (x')[0].split('\n')[0].trim();
                        if (cleanName) scores[cleanName] = (scores[cleanName] || 0) + 10;
                    });
                }
            } catch(e) {}
        });
    }

    // Intention (Vues récentes) - Weight: +3 par vue
    if (views) {
        views.forEach(v => {
            if (v.productName) {
                // Récence: Vues des dernières 24h = +5, plus ancien = +3
                const age = Date.now() - v.viewed_at;
                const weight = age < 24 * 60 * 60 * 1000 ? 5 : 3;
                scores[v.productName] = (scores[v.productName] || 0) + weight;
            }
        });
    }

    const sorted = Object.keys(scores).map(k => ({ product: k, score: scores[k] })).sort((a, b) => b.score - a.score);
    return sorted;
}

// --- Candidate Generation & Delivery ---

async function runRecommendationEngine() {
    console.log('[RECOMMENDATION] Démarrage du Heavy Ranker Twitter-Style...');
    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        
        // 1. Fetch Orders (Up to 60 days to better calculate frequency)
        const { data: rawOrders } = await supabase
            .from('bot_orders')
            .select('*')
            .gte('created_at', sixtyDaysAgo.toISOString());
        const orders = (rawOrders || []).map(decryptOrder);

        // 2. Fetch Views
        const { data: viewsData } = await supabase.from('bot_settings').select('data').eq('key', 'user_views').maybeSingle();
        const allViews = viewsData ? (viewsData.data || {}) : {};

        // 3. Fetch Tracking State (Anti-Fatigue)
        const { data: fatigueData } = await supabase.from('bot_settings').select('data').eq('key', 'fatigue_tracker').maybeSingle();
        const fatigueTracker = fatigueData ? (fatigueData.data || {}) : {};

        const now = Date.now();
        const currentHour = new Date().getHours();

        // Group orders by user_id
        const userOrders = {};
        if (orders) {
            orders.forEach(o => {
                if (!userOrders[o.user_id]) userOrders[o.user_id] = [];
                userOrders[o.user_id].push(o);
            });
        }

        const { data: settingsData } = await supabase.from('bot_settings').select('data').eq('key', 'app_settings').maybeSingle();
        const settings = settingsData ? (settingsData.data || {}) : {};
        const baseDomain = process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://farmstegridy-bot.onrender.com');
        const catalogUrl = (settings.mini_app_url ? `${settings.mini_app_url}/catalog` : `${baseDomain}/catalog`) + `?v=${Date.now()}`;

        const allUserIds = new Set([...Object.keys(userOrders), ...Object.keys(allViews)]);
        let notificationsSent = 0;

        for (const userId of allUserIds) {
            const uOrders = userOrders[userId] || [];
            const uViews = allViews[userId] || [];
            
            // Cooldown Filter: Don't spam! Minimum 48h between notifications.
            const lastSent = fatigueTracker[userId];
            if (lastSent && (now - lastSent) < 48 * 60 * 60 * 1000) {
                continue; // Skip, too recent
            }

            let candidateType = null;

            if (uOrders.length === 0) {
                // NOUVEAU CLIENT: S'il a des vues, on le relance après 2h, idéalement vers 18h ou 19h
                if (uViews.length > 0) {
                    const lastView = uViews[uViews.length - 1];
                    if (now - lastView.viewed_at > 2 * 60 * 60 * 1000) { // Wait at least 2h after view
                        if (currentHour >= 17 && currentHour <= 20) {
                            candidateType = 'acquisition';
                        }
                    }
                }
            } else {
                // CLIENT EXISTANT
                const favHour = computeFavoriteHour(uOrders);
                const freqMs = computeOrderFrequencyMs(uOrders);
                const lastOrderTime = Math.max(...uOrders.map(o => new Date(o.created_at).getTime()));
                const timeSinceLastOrder = now - lastOrderTime;
                
                // Predictive Timing: 1 hour before their usual ordering time
                let targetNotifHour = favHour - 1;
                if (targetNotifHour < 0) targetNotifHour = 23;
                
                // Frequency Matching
                if (timeSinceLastOrder >= (freqMs * 0.85)) {
                    // They are approaching their usual order day
                    if (currentHour === targetNotifHour || currentHour === favHour) {
                        candidateType = 'retention';
                    }
                }
                
                // Progressive Nudge: They missed their usual window significantly (e.g. 1.5x frequency)
                if (!candidateType && timeSinceLastOrder >= (freqMs * 1.5)) {
                    if (currentHour >= 18 && currentHour <= 20) { // Safe evening window
                        candidateType = 'retention_aggressive';
                    }
                }
            }

            // Delivery Phase
            if (candidateType) {
                const rankedProducts = rankProducts(uOrders, uViews);
                if (rankedProducts.length > 0) {
                    const topProduct = rankedProducts[0].product;
                    let firstName = "l'ami";
                    if (uOrders.length > 0) {
                        // Sort orders to ensure we look at the newest first
                        const sortedOrders = [...uOrders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                        // Find the first valid name that isn't a raw encrypted string (which contains colons and is very long)
                        const validOrder = sortedOrders.find(o => o.first_name && (!o.first_name.includes(':') || o.first_name.length < 100));
                        if (validOrder) firstName = validOrder.first_name;
                    }
                    
                    const message = generateDynamicText(firstName, topProduct, candidateType);
                    const keyboard = {
                        inline_keyboard: [[{ text: '🛍️ Ouvrir la Boutique', web_app: { url: catalogUrl } }]]
                    };

                    const tgId = userId.replace('telegram_', '');
                    
                    console.log(`[RECOMMENDATION] Sending ${candidateType} notif to ${tgId} for product ${topProduct}`);
                    
                    await sendMessageToUser(tgId, message, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
                    
                    fatigueTracker[userId] = now;
                    notificationsSent++;
                }
            }
        }

        // Save fatigue tracking state
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
