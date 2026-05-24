import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 4. livreur/orders
content = content.replace("""    app.get('/api/livreur/orders', async (req, res) => {
        try {
            const { userId } = req.query;
            const { getLivreurOrders } = require('./services/database');
            const { activeChatHistory } = require('./handlers/order_system');
            const orders = await getLivreurOrders(userId);
            const enriched = orders.map(o => {
                let chatHistory = null;
                const hist = activeChatHistory.get(String(o.id));
                if (hist && hist.length > 0) {
                    const lastMsg = hist[hist.length - 1];
                    chatHistory = { count: hist.length, lastMessage: lastMsg.text, senderRole: lastMsg.role, messages: hist };
                } else if (parseInt(o.chat_count) > 0) {
                    chatHistory = { count: parseInt(o.chat_count), lastMessage: 'Messages précédents', senderRole: 'system', messages: [] };
                }
                return { ...o, chatHistory };
            });
            res.json(enriched);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });""", """    app.get('/api/livreur/orders', async (req, res) => {
        try {
            const { userId } = req.query;
            const { getLivreurOrders } = require('./services/database');
            const { activeChatHistory } = require('./handlers/order_system');
            const { translate } = require('./services/translator');
            const targetLang = req.query.lang || 'fr';
            const orders = await getLivreurOrders(userId);
            const enriched = await Promise.all(orders.map(async o => {
                let cart = o.cart;
                if (targetLang !== 'fr' && Array.isArray(cart)) {
                    cart = await Promise.all(cart.map(async item => {
                        return { ...item, name: await translate(item.name, targetLang) };
                    }));
                }
                let prodName = o.product_name;
                if (targetLang !== 'fr' && prodName) {
                    prodName = await translate(prodName, targetLang);
                }

                let chatHistory = null;
                const hist = activeChatHistory.get(String(o.id));
                if (hist && hist.length > 0) {
                    const lastMsg = hist[hist.length - 1];
                    chatHistory = { count: hist.length, lastMessage: lastMsg.text, senderRole: lastMsg.role, messages: hist };
                } else if (parseInt(o.chat_count) > 0) {
                    chatHistory = { count: parseInt(o.chat_count), lastMessage: 'Messages précédents', senderRole: 'system', messages: [] };
                }
                return { ...o, cart, product_name: prodName, chatHistory };
            }));
            res.json(enriched);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });""")

# 5. livreur/available-orders
content = content.replace("""    app.get('/api/livreur/available-orders', async (req, res) => {
        try {
            const { city } = req.query;
            const { getAvailableOrders } = require('./services/database');
            const orders = await getAvailableOrders(city);
            res.json(orders);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });""", """    app.get('/api/livreur/available-orders', async (req, res) => {
        try {
            const { city, lang } = req.query;
            const targetLang = lang || 'fr';
            const { getAvailableOrders } = require('./services/database');
            const { translate } = require('./services/translator');
            const orders = await getAvailableOrders(city);
            
            const enriched = await Promise.all(orders.map(async o => {
                let cart = o.cart;
                if (targetLang !== 'fr' && Array.isArray(cart)) {
                    cart = await Promise.all(cart.map(async item => {
                        return { ...item, name: await translate(item.name, targetLang) };
                    }));
                }
                let prodName = o.product_name;
                if (targetLang !== 'fr' && prodName) {
                    prodName = await translate(prodName, targetLang);
                }
                return { ...o, cart, product_name: prodName };
            }));
            res.json(enriched);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });""")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("server.js patched 2!")
