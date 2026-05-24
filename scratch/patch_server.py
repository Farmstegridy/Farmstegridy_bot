import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. products
content = content.replace("""    app.get('/api/products', async (req, res) => {
        try { res.json(await getProducts()); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });""", """    app.get('/api/products', async (req, res) => {
        try { 
            let products = await getProducts();
            const lang = req.query.lang || 'fr';
            if (lang !== 'fr') {
                const { translateProducts } = require('./services/translator');
                products = await translateProducts(products, lang);
            }
            res.json(products); 
        }
        catch (e) { 
            console.error('[API Products] Error:', e);
            res.status(500).json({ error: 'Erreur serveur' }); 
        }
    });""")

# 2. news
content = content.replace("""            let filteredNews = news.filter(n => {
                if(n.status !== 'active') return false;
                const expires = new Date(n.expires_at).getTime();
                if(now > expires) return false;
                return true;
            });
            
            res.json(filteredNews);""", """            let filteredNews = news.filter(n => {
                if(n.status !== 'active') return false;
                const expires = new Date(n.expires_at).getTime();
                if(now > expires) return false;
                return true;
            });
            
            const lang = req.query.lang || 'fr';
            if (lang !== 'fr') {
                const { translate } = require('./services/translator');
                filteredNews = await Promise.all(filteredNews.map(async b => {
                    const translatedMsg = await translate(b.message || '', lang);
                    return { ...b, message: translatedMsg };
                }));
            }
            
            res.json(filteredNews);""")

# 3. user-orders
content = content.replace("""            const enriched = (data || []).map(o => {
                const orderMessages = history.filter(m => String(m.orderId) === String(o.id));
                let chatHistory = null;
                if (orderMessages.length > 0) {
                    const lastMsg = orderMessages[orderMessages.length - 1];
                    chatHistory = {
                        count: parseInt(o.chat_count) || 0,
                        lastMessage: lastMsg.text || lastMsg.message,
                        senderRole: lastMsg.role,
                        messages: orderMessages
                    };
                } else if (parseInt(o.chat_count) > 0) {
                    // Fallback si pas de messages trouvés (anciens messages sans orderId)
                    chatHistory = {
                        count: parseInt(o.chat_count),
                        lastMessage: 'Messages précédents non disponibles',
                        senderRole: 'system',
                        messages: []
                    };
                }
                
                return {
                    ...o,
                    chatHistory
                };
            });
            res.json(enriched);""", """            const { translate } = require('./services/translator');
            const targetLang = req.query.lang || 'fr';
            const enriched = await Promise.all((data || []).map(async o => {
                const orderMessages = history.filter(m => String(m.orderId) === String(o.id));
                let chatHistory = null;
                if (orderMessages.length > 0) {
                    const lastMsg = orderMessages[orderMessages.length - 1];
                    chatHistory = {
                        count: parseInt(o.chat_count) || 0,
                        lastMessage: lastMsg.text || lastMsg.message,
                        senderRole: lastMsg.role,
                        messages: orderMessages
                    };
                } else if (parseInt(o.chat_count) > 0) {
                    // Fallback si pas de messages trouvés (anciens messages sans orderId)
                    chatHistory = {
                        count: parseInt(o.chat_count),
                        lastMessage: 'Messages précédents non disponibles',
                        senderRole: 'system',
                        messages: []
                    };
                }
                
                let cart = o.cart;
                if (targetLang !== 'fr') {
                    if (Array.isArray(cart)) {
                        cart = await Promise.all(cart.map(async item => {
                            const tName = await translate(item.name, targetLang);
                            return { ...item, name: tName };
                        }));
                    }
                    if (o.product_name) o.product_name = await translate(o.product_name, targetLang);
                }
                
                return {
                    ...o,
                    cart,
                    chatHistory
                };
            }));
            res.json(enriched);""")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("server.js patched!")
