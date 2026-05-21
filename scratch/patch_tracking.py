import re

# 1. Patch server.js
with open('server.js', 'r', encoding='utf-8') as f:
    server_content = f.read()

tracking_endpoint = """
    // X-Engine: Track product views
    app.post('/api/tracking/view', async (req, res) => {
        try {
            const { telegramId, productId, category } = req.body;
            if (!telegramId) return res.json({ success: false });
            
            const { supabase } = require('./services/supabase');
            const { COL_USERS } = require('./services/database');
            
            const { data: user } = await supabase.from(COL_USERS).select('data').eq('telegram_id', String(telegramId)).maybeSingle();
            if (user) {
                const history = user.data.view_history || [];
                history.push({
                    productId,
                    category,
                    timestamp: new Date().toISOString(),
                    weight: 1
                });
                
                // Keep only last 50
                if (history.length > 50) history.shift();
                
                const newData = { ...user.data, view_history: history };
                await supabase.from(COL_USERS).update({ data: newData }).eq('telegram_id', String(telegramId));
            }
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false });
        }
    });

    app.get('/api/products',"""

if "/api/tracking/view" not in server_content:
    server_content = server_content.replace("    app.get('/api/products',", tracking_endpoint)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_content)

# 2. Patch catalog.html
with open('web/views/catalog.html', 'r', encoding='utf-8') as f:
    catalog_content = f.read()

tracking_js = """        function openProductModal(p) {
            currentProduct = p;
            
            // X-Engine Tracking Ping
            const uid = tg.initDataUnsafe?.user?.id;
            if (uid) {
                fetch('/api/tracking/view', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegramId: uid, productId: p.id, category: p.category })
                }).catch(()=>{});
            }
            
            document.getElementById('modal-img').src = p.image || '/img/placeholder.png';"""

if "X-Engine Tracking Ping" not in catalog_content:
    catalog_content = catalog_content.replace("""        function openProductModal(p) {
            currentProduct = p;
            document.getElementById('modal-img').src = p.image || '/img/placeholder.png';""", tracking_js)

with open('web/views/catalog.html', 'w', encoding='utf-8') as f:
    f.write(catalog_content)

