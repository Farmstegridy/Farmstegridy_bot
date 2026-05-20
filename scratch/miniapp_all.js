    app.post('/api/mini-app/cart', async (req, res) => {
        try {
            const { userId, items } = req.body;
            if (!userId || !items) return res.status(400).json({ error: 'Données manquantes' });
            const eventBus = require('./services/event_bus'); 
            eventBus.emit('mini_app_cart_submitted', { userId, items, platform: 'telegram' });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/mini-app/order', async (req, res) => {
        try {
            const { userId, items, address, customerName, phone, deliveryMethod, deliveryFee, total } = req.body;
            if (!userId || !items || !address) return res.status(400).json({ error: 'Informations de livraison manquantes' });

            const eventBus = require('./services/event_bus'); 
            eventBus.emit('mini_app_order_submitted', { 
                userId, items, address, customerName, phone, deliveryMethod, deliveryFee, total,
                platform: 'telegram' 
            });

            res.json({ success: true });
        } catch (e) {
            console.error('Mini App Order API Error:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/user-info', async (req, res) => {
        try {
            const { userId } = req.query;
            const { getUser, getAppSettings } = require('./services/database');
            const user = await getUser(userId);
            const settings = await getAppSettings();
            
            if (!user) return res.status(404).json({ error: 'User not found' });
            
            let addressStr = user.address || '';
            if (!addressStr && Array.isArray(user.data?.addresses) && user.data.addresses.length > 0) {
                try {
                    addressStr = JSON.stringify(user.data.addresses.map((a, i) => ({
                        id: String(Date.now() + i),
                        name: 'Adresse ' + (i + 1),
                        address: a
                    })));
                } catch(e) {}
            }

            res.json({
                ...user,
                address: addressStr,
                isLivreur: !!user.is_livreur,
                isAdmin: !!user.is_admin,
                isAvailable: !!user.is_available,
                balance: user.wallet_balance || 0,
                points: user.points || 0,
                referralLink: `https://t.me/${settings.bot_username}?start=${user.referral_code}`,
                hotline: settings.admin_telegram_id || 'admin'
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/products/reviews', async (req, res) => {
        try {
            const { productId } = req.query;
            const { getReviews } = require('./services/database');
            const reviews = await getReviews(50);
            res.json(reviews.filter(r => r.product_id === productId));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/news', async (req, res) => {
        try {
            const { getBroadcastHistory } = require('./services/database');
            const news = await getBroadcastHistory(10);
            res.json(news.filter(b => b.status === 'completed'));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin/toggle-feature', async (req, res) => {
        try {
            const { userId, productId, featured } = req.body;
            const hotlineAdmins = require('./services/state').hotlineAdmins || new Set();
            // userId in req.body should be the platform_id (e.g. 12345)
            if (!hotlineAdmins.has(String(userId))) return res.status(403).json({ error: 'Unauthorized' });

            const { updateProduct } = require('./services/database');
            await updateProduct(productId, { is_featured: featured });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/user-orders', async (req, res) => {
        try {
            const { userId } = req.query;
            const { supabase } = require('./config/supabase');
            const { activeChatHistory } = require('./handlers/order_system');
            const { data } = await supabase.from('bot_orders')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);
            
            const enriched = (data || []).map(o => ({
                ...o,
                chatHistory: activeChatHistory ? activeChatHistory.get(o.id) : null
            }));
            res.json(enriched);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/product-reviews', async (req, res) => {
        try {
            const { productId } = req.query;
            const { getReviews } = require('./services/database');
            const reviews = await getReviews(20);
            const filtered = reviews.filter(r => r.product_id === productId || !r.product_id);
            res.json(filtered);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/mini-app/sync-cart', async (req, res) => {
        try {
            const { userId, cart } = req.body;
            const { syncUserCart } = require('./services/database');
            await syncUserCart(userId, cart);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/mini-app/create-order', async (req, res) => {
        try {
            const { userId, items, total, address, note, platform, discount, promoCode, promoDiscount, walletDiscount } = req.body;
            const { createOrder, getUser, updateUserWallet } = require('./services/database');
            const { notifyAdmins } = require('./services/notifications');
            
            const user = await getUser(userId);
            
            // Validation des réductions
            let appliedWalletDiscount = parseFloat(walletDiscount) || (!promoCode ? parseFloat(discount) || 0 : 0);
            let appliedPromoDiscount = parseFloat(promoDiscount) || (promoCode ? parseFloat(discount) || 0 : 0);
            let totalAppliedDiscount = appliedWalletDiscount + appliedPromoDiscount;

            if (appliedWalletDiscount > 0) {
                if (!user || !user.wallet_balance || user.wallet_balance < appliedWalletDiscount) {
                    return res.status(400).json({ error: "Solde de portefeuille insuffisant pour cette réduction." });
                }
            }

            // On construit la liste textuelle des produits (comme le fait le bot)
            const productListStr = items.map(it => `${it.name} (x${it.qty})`).join(', ');
            const totalQty = items.reduce((acc, it) => acc + it.qty, 0);

            const orderData = {
                user_id: userId,
                product_name: productListStr,
                quantity: totalQty,
                cart: items,
                total_price: total,
                discount_applied: totalAppliedDiscount,
                address: note ? `${address} (Note: ${note})` : address,
                platform: platform || 'telegram',
                status: 'pending',
                username: user?.username || 'inconnu',
                first_name: user?.first_name || 'Inconnu'
            };

            const { order, error } = await createOrder(orderData);
            if (error) {
                // Fallback si 'cart' manque aussi (vieille DB)
                if (error.message && error.message.includes("'cart'")) {
                    delete orderData.cart;
                    const retry = await createOrder(orderData);
                    if (retry.error) throw retry.error;
                    order = retry.order;
                } else {
                    throw error;
                }
            }

            // DEDUCT WALLET BALANCE ONLY FOR WALLET DISCOUNT
            if (appliedWalletDiscount > 0) {
                const newBalance = user.wallet_balance - appliedWalletDiscount;
                await updateUserWallet(user.id, newBalance);
            }

            // Notification Admin & User
            const bot = getBotInstance();
            if (bot) {
                const promoStr = promoCode ? `\n🏷️ Code Promo : <b>${promoCode}</b> (-${appliedPromoDiscount}€)` : '';
                const adminMsg = `🛒 <b>NOUVELLE COMMANDE (MINI APP)</b>\n\n` +
                                 `👤 Client : ${user?.first_name || userId}\n` +
                                 `📦 Produits : ${productListStr}\n` +
                                 `💰 Total à payer : <b>${total}€</b>` + promoStr + `\n` +
                                 `📍 Adresse : <i>${address}</i>\n` +
                                 `📝 Note : ${note || 'Aucune'}\n\n` +
                                 `#${order.id.slice(-5)}`;
                await notifyAdmins(bot, adminMsg);

                const tgId = userId.split('_')[1];
                await bot.telegram.sendMessage(tgId, `✅ <b>Commande confirmée !</b>\n\nMerci pour votre achat sur la Mini App. Votre commande #${order.id.slice(-5)} est en cours de traitement.`, { parse_mode: 'HTML' }).catch(() => {});
            }

            res.json({ success: true, orderId: order.id });
        } catch (e) {
            console.error('[API-Order-Err]', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/mini-app/trigger-chat', async (req, res) => {
        try {
            const { userId, orderId } = req.body;
            const tgId = userId.split('_')[1];
            const bot = getBotInstance();
            if (bot) {
                const { Markup } = require('telegraf');
                await bot.telegram.sendMessage(tgId, `📞 <b>Assistance Livraison #${orderId.slice(-5)}</b>\n\nCliquez sur le bouton ci-dessous pour ouvrir le chat sécurisé et anonyme avec votre livreur.`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('💬 Parler au livreur', `chat_livreur_${orderId}`)]])
                });
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/livreur/orders', async (req, res) => {
        try {
            const { userId } = req.query;
            const { getLivreurOrders } = require('./services/database');
            const { activeChatHistory } = require('./handlers/order_system');
            const orders = await getLivreurOrders(userId);
            const enriched = orders.map(o => ({
                ...o,
                chatHistory: activeChatHistory ? activeChatHistory.get(o.id) : null
            }));
            res.json(enriched);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/livreur/history', async (req, res) => {
        try {
            const { userId } = req.query;
            const { getLivreurHistory } = require('./services/database');
            const history = await getLivreurHistory(userId);
            res.json(history);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/livreur/available-orders', async (req, res) => {
        try {
            const { city } = req.query;
            const { getAvailableOrders } = require('./services/database');
            const orders = await getAvailableOrders(city);
            res.json(orders);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/livreur/set-availability', async (req, res) => {
        try {
            const { userId, available } = req.body;
            const { setLivreurAvailability } = require('./services/database');
            await setLivreurAvailability(userId, available);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/livreur/take-order', async (req, res) => {
        try {
            const { userId, orderId } = req.body;
            const { getOrder, assignOrderLivreur, getUser } = require('./services/database');
            
            const order = await getOrder(orderId);
            if (!order || order.status !== 'pending') {
                return res.status(400).json({ error: 'Commande non disponible' });
            }

            const user = await getUser(userId);
            await assignOrderLivreur(orderId, userId, user?.first_name || 'Livreur App');
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/livreur/update-status', async (req, res) => {
        try {
            const { orderId, status, rating, userId } = req.body;
            const { updateOrderStatus, getOrder, getAppSettings } = require('./services/database');
            const { notifyAdmins } = require('./services/notifications');
            const { activeChatHistory } = require('./handlers/order_system');
            const bot = getBotInstance();

            if (status === 'abandoned') {
                await updateOrderStatus(orderId, 'validated', { livreur_id: null, livreur_name: null });
                if (activeChatHistory) activeChatHistory.delete(orderId);
                if (bot) {
                    notifyAdmins(bot, `⚠️ <b>LIVREUR ABANDON (MINI APP)</b>\n\n🆔 Commande : <code>#${orderId.slice(-5)}</code>\nL'ordre est de nouveau disponible dans la file.`).catch(() => {});
                }
                return res.json({ success: true });
            }

            if (status === 'cancelled') {
                if (activeChatHistory) activeChatHistory.delete(orderId);
                const order = await getOrder(orderId);
                const shortId = orderId.slice(-5);
                await updateOrderStatus(orderId, 'cancelled');
                if (bot) {
                    notifyAdmins(bot, `🚩 <b>ANNULATION LIVREUR (MINI APP)</b>\n\nLa commande <b>#${shortId}</b> a été annulée par le livreur.`).catch(() => {});
                }
                if (order?.user_id) {
                    const { sendTelegramMessage } = require('./services/notifications');
                    sendTelegramMessage(order.user_id, `🚩 <b>COMMANDE ANNULÉE</b>\n\nVotre commande <b>#${shortId}</b> a été annulée par le livreur.\nMotif: Incident ou stock indisponible.`).catch(() => {});
                }
                return res.json({ success: true });
            }

            const extra = {};
            if (rating) extra.feedback_rating = rating;
            await updateOrderStatus(orderId, status, extra);
            
            if (status === 'delivered') {
                if (activeChatHistory) activeChatHistory.delete(orderId);
                if (userId) {
                    const { getUser, incrementOrderCount } = require('./services/database');
                    const u = await getUser(userId);
                    await updateOrderStatus(orderId, 'delivered', {
                        livreur_id: userId,
                        livreur_name: u?.first_name || 'Livreur'
                    });
                    incrementOrderCount(userId).catch(() => {});
                }
            }
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/livreur/notify-eta', async (req, res) => {
        try {
            const { userId, orderId, timeCode } = req.body;
            const { getOrder, getAppSettings, getUser } = require('./services/database');
            const { sendTelegramMessage, notifyAdmins } = require('./services/notifications');
            const { Markup } = require('telegraf');
            const bot = getBotInstance();

            const order = await getOrder(orderId);
            if (!order) return res.status(404).json({ error: 'Commande introuvable' });

            let timeText = "";
            if (timeCode === '1h') timeText = "⏰ dans - d'1h";
            else if (timeCode === '30m') timeText = "⏳ dans 30 min";
            else if (timeCode === '10m') timeText = "⏳ dans 10 min";
            else if (timeCode === '5m') timeText = "⚡ dans 5 min";
            else if (timeCode === 'here') timeText = "📍 Suis arrivé, descends";

            const livreurUser = await getUser(userId);
            const livreurName = livreurUser?.first_name || 'Votre livreur';

            await sendTelegramMessage(order.user_id,
                `🔔 <b>Mise à jour Livraison #${orderId.slice(-5)}</b>\n\n` +
                `Votre livreur vous informe qu'il arrive : <b>${timeText}</b>\n\n` +
                `<i>Restez joignable !</i>`,
                {
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('💬 Répondre au livreur', `chat_livreur_${orderId}`)],
                        [Markup.button.callback('◀️ Menu principal', 'main_menu')]
                    ])
                }
            );

            if (bot) {
                notifyAdmins(bot, `⏳ <b>ETA ENVOYÉ (MINI APP)</b>\n\n🆔 Commande : <code>#${orderId.slice(-5)}</code>\n👤 Livreur : ${livreurName}\n🕒 ETA : ${timeText}`).catch(() => {});
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/livreur/start-chat', async (req, res) => {
        try {
            const { userId, orderId } = req.body;
            const { getOrder } = require('./services/database');
            const { awaitingChatReply, activeChatHistory } = require('./handlers/order_system');
            const bot = getBotInstance();

            const order = await getOrder(orderId);
            if (!order) return res.status(404).json({ error: 'Commande introuvable' });

            const count = parseInt(order.chat_count) || 0;
            if (count >= 6) {
                return res.status(400).json({ error: "Limite d'échanges atteinte (6/6)." });
            }

            const targetId = order.user_id;
            const tgId = userId.replace('telegram_', '').replace('whatsapp_', '');

            if (awaitingChatReply) {
                awaitingChatReply.set(userId, {
                    orderId,
                    targetId,
                    role: 'client',
                    promptMsgId: null
                });
            }

            const chatHist = activeChatHistory ? activeChatHistory.get(orderId) : null;
            let promptText = `💬 <b>SESSION DE CHAT (${count}/6)</b>\n\n`;
            if (chatHist) {
                promptText += `📜 <b>Dernier échange :</b>\n` +
                    `👤 <b>${chatHist.senderRole === 'client' ? 'Client' : 'Livreur'} (${chatHist.senderName || ''})</b> à ${chatHist.timestamp || ''} :\n` +
                    `"<i>${chatHist.lastMessage}</i>"\n\n`;
            }

            promptText += `👉 <b>À votre tour :</b>\n` +
                (count === 5 ? "⚠️ <i>Ceci est le dernier message de conclusion (6/6).</i>\n" : "") +
                `Saisissez et envoyez votre message ci-dessous :`;

            if (bot) {
                const { Markup } = require('telegraf');
                bot.telegram.sendMessage(tgId, promptText, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('◀️ Annuler le chat', `view_active_${orderId}`)]])
                }).catch(() => {});
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/livreur/send-chat-message', async (req, res) => {
        try {
            const { userId, orderId, text } = req.body;
            const { getOrder, incrementChatCount, saveClientReply, getUser } = require('./services/database');
            const { sendTelegramMessage, notifyAdmins } = require('./services/notifications');
            const { activeChatHistory } = require('./handlers/order_system');
            const { Markup } = require('telegraf');
            const bot = getBotInstance();

            const order = await getOrder(orderId);
            if (!order) return res.status(404).json({ error: 'Commande introuvable' });

            const count = parseInt(order.chat_count) || 0;
            if (count >= 6) {
                return res.status(400).json({ error: "Limite d'échanges atteinte (6/6)." });
            }

            const newCount = await incrementChatCount(orderId);
            const shortId = String(orderId).slice(-5);
            const targetId = order.user_id;

            const livreurUser = await getUser(userId);
            const livreurName = livreurUser?.first_name || 'Livreur';

            await sendTelegramMessage(targetId,
                `💬 <b>Message du livreur (Commande #${shortId})</b>\n\n"<i>${text}</i>"\n\n` +
                `📊 <i>Message ${newCount}/6</i>${newCount >= 6 ? '\n⚠️ <b>Dernier échange consommé.</b>' : ''}`,
                {
                    ...Markup.inlineKeyboard([
                        ...(newCount < 6 ? [[Markup.button.callback(`💬 Répondre (Tour ${newCount + 1}/6)`, `chat_livreur_${orderId}`)]] : []),
                        [Markup.button.callback('◀️ Menu principal', 'main_menu')]
                    ])
                }
            );

            const chatObj = {
                lastMessage: text,
                senderRole: 'livreur',
                senderName: livreurName,
                timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                count: newCount
            };
            if (activeChatHistory) {
                activeChatHistory.set(orderId, chatObj);
            }
            saveClientReply(orderId, text).catch(() => {});

            if (bot) {
                const alertMsg = `💬 <b>CHAT LIVREUR (MINI APP)</b>\n\n🆔 Commande : <code>#${shortId}</code>\n👤 De : ${livreurName}\n📝 Message : "<i>${text}</i>"`;
                notifyAdmins(bot, alertMsg).catch(() => {});
            }

            res.json({ success: true, chatHistory: chatObj });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/mini-app/send-chat-message', async (req, res) => {
        try {
            const { userId, orderId, text } = req.body;
            const { getOrder, incrementChatCount, saveClientReply, getUser } = require('./services/database');
            const { sendTelegramMessage, notifyAdmins } = require('./services/notifications');
            const { activeChatHistory } = require('./handlers/order_system');
            const { Markup } = require('telegraf');
            const bot = getBotInstance();

            const order = await getOrder(orderId);
            if (!order) return res.status(404).json({ error: 'Commande introuvable' });

            const count = parseInt(order.chat_count) || 0;
            if (count >= 6) {
                return res.status(400).json({ error: "Limite d'échanges atteinte (6/6)." });
            }

            const newCount = await incrementChatCount(orderId);
            const shortId = String(orderId).slice(-5);
            const targetId = order.livreur_id;

            const clientUser = await getUser(userId);
            const clientName = clientUser?.first_name || 'Client';

            if (targetId) {
                await sendTelegramMessage(targetId,
                    `💬 <b>Message du client (Commande #${shortId})</b>\n\n"<i>${text}</i>"\n\n` +
                    `📊 <i>Message ${newCount}/6</i>${newCount >= 6 ? '\n⚠️ <b>Dernier échange consommé.</b>' : ''}`,
                    {
                        ...Markup.inlineKeyboard([
                            ...(newCount < 6 ? [[Markup.button.callback(`💬 Répondre (Tour ${newCount + 1}/6)`, `chat_livreur_${orderId}`)]] : []),
                            [Markup.button.callback('◀️ Menu Livreur', 'livreur_menu')]
                        ])
                    }
                ).catch(() => {});
            }

            const chatObj = {
                lastMessage: text,
                senderRole: 'client',
                senderName: clientName,
                timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                count: newCount
            };
            if (activeChatHistory) {
                activeChatHistory.set(orderId, chatObj);
            }
            saveClientReply(orderId, text).catch(() => {});

            if (bot) {
