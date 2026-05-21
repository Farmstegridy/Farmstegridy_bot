import re

with open('web/views/catalog.html', 'r') as f:
    content = f.read()

# 1. Fix fetch
content = content.replace(
"""        var originalFetch = window.fetch;
        window.fetch = function() {
            let resource = arguments[0];
            let config = arguments[1] || {};
            if (typeof resource === 'string' && resource.startsWith('/')) {
                if (!config.headers) config.headers = {};
                if (!(config.headers instanceof Headers)) {
                    config.headers['ngrok-skip-browser-warning'] = '69420';
                } else {
                    config.headers.append('ngrok-skip-browser-warning', '69420');
                }
            }
            return originalFetch.call(window, resource, config);
        };""",
"""        var originalFetch = window.fetch;
        window.fetch = function() {
            var resource = arguments[0];
            if (typeof resource === 'string' && resource.startsWith('/')) {
                var config = arguments[1] || {};
                if (!config.headers) config.headers = {};
                if (!(config.headers instanceof Headers)) {
                    config.headers['ngrok-skip-browser-warning'] = '69420';
                } else {
                    config.headers.append('ngrok-skip-browser-warning', '69420');
                }
                return originalFetch.call(window, resource, config);
            }
            return originalFetch.apply(window, arguments);
        };"""
)

# 2. Fix media gallery
content = content.replace(
"""        // Helper : extrait la première URL d'image depuis le format JSON array ou string
        function getImgUrl(product) {
            const raw = product?.image_url;
            if (!raw) return null;
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].url || null;
            } catch(e) {}
            if (typeof raw === 'string' && raw.startsWith('http')) return raw;
            return null;
        }""",
"""        // Helper : extrait tous les médias (vidéos et images)
        function getAllMedia(product) {
            const raw = product?.image_url;
            if (!raw) return [];
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch(e) {}
            if (typeof raw === 'string' && raw.startsWith('http')) return [{url: raw, type: 'image'}];
            return [];
        }

        function getImgUrl(product) {
            const media = getAllMedia(product);
            return media.length > 0 ? media[0].url : null;
        }

        function renderMediaGallery(product, containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            const mediaList = getAllMedia(product);
            
            if (mediaList.length === 0) {
                container.innerHTML = `<img src="https://placehold.co/400x400/111/fff?text=${encodeURIComponent(product.name)}" style="width:100%; height:100%; object-fit:contain;">`;
                return;
            }

            if (mediaList.length === 1) {
                const m = mediaList[0];
                if (m.type === 'video' || m.url.endsWith('.mp4') || m.url.endsWith('.webm') || m.url.endsWith('.mov')) {
                    container.innerHTML = `<video controls playsinline style="width:100%; height:100%; object-fit:contain; background:#000;"><source src="${m.url}"></video>`;
                } else {
                    container.innerHTML = `<img src="${m.url}" style="width:100%; height:100%; object-fit:contain;">`;
                }
                return;
            }

            // Gallery
            let html = `<div style="position:relative; width:100%; height:100%; display:flex; overflow-x:auto; scroll-snap-type: x mandatory; background:#000;">`;
            mediaList.forEach(m => {
                const isVideo = m.type === 'video' || m.url.endsWith('.mp4') || m.url.endsWith('.webm') || m.url.endsWith('.mov');
                if (isVideo) {
                    html += `<div style="flex:0 0 100%; scroll-snap-align:start; position:relative; width:100%; height:100%;">
                                <video controls playsinline style="width:100%; height:100%; object-fit:contain;"><source src="${m.url}"></video>
                             </div>`;
                } else {
                    html += `<div style="flex:0 0 100%; scroll-snap-align:start; position:relative; width:100%; height:100%;">
                                <img src="${m.url}" style="width:100%; height:100%; object-fit:contain;">
                             </div>`;
                }
            });
            html += `</div>
                     <div style="position:absolute; bottom:10px; width:100%; text-align:center; pointer-events:none;">
                         <span style="background:rgba(0,0,0,0.5); color:#fff; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:800; backdrop-filter:blur(4px);">Glisser pour voir plus</span>
                     </div>`;
            container.innerHTML = html;
        }"""
)

# 3. Fix p-img to p-media
content = content.replace(
"""            document.getElementById('p-img').src = getImgUrl(activeProduct) || `https://placehold.co/400x400/111/fff?text=${encodeURIComponent(activeProduct.name)}`;""",
"""            renderMediaGallery(activeProduct, 'p-media');"""
)

content = content.replace(
"""                        <div id="p-media" style="width:100%; height:300px; background:#111; position:relative;">
                            <img id="p-img" src="" style="width:100%; height:100%; object-fit:cover;">""",
"""                        <div id="p-media" style="width:100%; height:300px; background:#111; position:relative;">"""
)

# 4. Add chat_history sync
content = content.replace(
"""                if (uRes && uRes.ok) userInfo = await uRes.json();""",
"""                if (uRes && uRes.ok) {
                    userInfo = await uRes.json();
                    if (userInfo && userInfo.chat_history) {
                        adminChatMessages = userInfo.chat_history;
                        safeSetStorage('stb_admin_chat', adminChatMessages);
                        if (document.getElementById('page-chat').style.display === 'block') {
                            loadSupportChat();
                        }
                    }
                }"""
)

# 5. Fix loadSupportChat
content = content.replace(
"""        async function loadSupportChat() {
            document.getElementById('chat-history').innerHTML = '';
            adminChatMessages.forEach(m => renderChatMessage(m.from, m.text));
        }""",
"""        async function loadSupportChat() {
            document.getElementById('chat-history').innerHTML = '';
            adminChatMessages.forEach(m => renderChatMessage(m.role || m.from, m.text));
        }"""
)

# 6. Fix sendChatMessage
content = content.replace(
"""        async function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            
            adminChatMessages.push({ from: 'me', text: text });
            renderChatMessage('me', text);
            safeSetStorage('stb_admin_chat', adminChatMessages);
            
            try {
                fetch('/api/mini-app/send-chat-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: 'telegram_' + tg.initDataUnsafe?.user?.id, text: text })
                });
            } catch(e) {}
        }""",
"""        async function sendChatMessage() {
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            
            adminChatMessages.push({ role: 'client', text: text, ts: Date.now() });
            renderChatMessage('client', text);
            safeSetStorage('stb_admin_chat', adminChatMessages);
            
            try {
                fetch('/api/user/send-chat-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: 'telegram_' + tg.initDataUnsafe?.user?.id, text: text })
                });
            } catch(e) {}
        }"""
)

# 7. Fix renderChatMessage
content = content.replace(
"""        function renderChatMessage(from, text) {
            const isMe = from === 'me';""",
"""        function renderChatMessage(from, text) {
            const isMe = from === 'me' || from === 'client';"""
)

with open('web/views/catalog.html', 'w') as f:
    f.write(content)
