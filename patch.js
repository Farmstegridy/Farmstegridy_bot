const fs = require('fs');
const path = require('path');

const baseDir = '/Users/dikenson/Desktop/Thegreenvalley_BOT';
const targets = [
  '/Users/dikenson/Desktop/Farmstegridy_bot',
  '/Users/dikenson/Desktop/shoptonbot mini app',
  '/Users/dikenson/Desktop/Projet BOT (client deja terminée) '
];

try {
    const dbPath = path.join(baseDir, 'services/database.js');
    const dbStr = fs.readFileSync(dbPath, 'utf8');
    const registerUserBlock = dbStr.substring(dbStr.indexOf('async function registerUser'), dbStr.indexOf('async function updateLoyaltyPoints'));

    const serverPath = path.join(baseDir, 'server.js');
    const serverStr = fs.readFileSync(serverPath, 'utf8');
    const adminChatBlock = serverStr.substring(serverStr.indexOf("app.post('/api/admin-chat/send'"), serverStr.indexOf("app.post('/api/admin-chat/bulk-message'"));

    const catalogPath = path.join(baseDir, 'web/views/catalog.html');
    const catalogStr = fs.readFileSync(catalogPath, 'utf8');
    const bottomNavBlock = catalogStr.substring(catalogStr.indexOf('<div class="bottom-nav">'), catalogStr.indexOf('<div class="sheet" id="selection-modal">'));
    const clientChatLogicBlock = catalogStr.substring(catalogStr.indexOf('function renderAdminChatMessages()'), catalogStr.indexOf('async function pollUpdatesSilent()'));
    const supportModalMic = catalogStr.substring(catalogStr.indexOf('<div id="support-modal"'), catalogStr.indexOf('<script>')); // A bit too broad, let's target the exact input container
    
    // specifically the input area in support modal:
    const supportInputBlock = catalogStr.substring(catalogStr.indexOf('<div style="display:flex; gap:10px; margin-top:15px; position:relative;">'), catalogStr.indexOf('</div>\n    </div>\n\n    <script>'));

    const dashPath = path.join(baseDir, 'web/views/dashboard.html');
    const dashStr = fs.readFileSync(dashPath, 'utf8');
    const chatModalBlock = dashStr.substring(dashStr.indexOf('<div class="chat-reply-input"'), dashStr.indexOf('<!-- JS -->'));
    const adminRecordBlock = dashStr.substring(dashStr.indexOf('let adminMediaRecorder;'), dashStr.indexOf('window.onclick = function(e)'));
    const renderChatBlock = dashStr.substring(dashStr.indexOf('function openChatReplyModal'), dashStr.indexOf('async function applyOrderAction'));

    targets.forEach(t => {
        console.log("Patching", t);
        
        // 1. DB
        const tDb = path.join(t, 'services/database.js');
        if (fs.existsSync(tDb)) {
            let str = fs.readFileSync(tDb, 'utf8');
            const r1 = str.substring(str.indexOf('async function registerUser'), str.indexOf('async function updateLoyaltyPoints'));
            fs.writeFileSync(tDb, str.replace(r1, registerUserBlock));
        }

        // 2. Server
        const tServer = path.join(t, 'server.js');
        if (fs.existsSync(tServer)) {
            let str = fs.readFileSync(tServer, 'utf8');
            const r1 = str.substring(str.indexOf("app.post('/api/admin-chat/send'"), str.indexOf("app.post('/api/admin-chat/bulk-message'"));
            fs.writeFileSync(tServer, str.replace(r1, adminChatBlock));
            
            // Also need to patch app.post('/api/upload-logo' block if missing file-upload config, but express-fileupload is already in package.json usually
        }

        // 3. Catalog
        const tCat = path.join(t, 'web/views/catalog.html');
        if (fs.existsSync(tCat)) {
            let str = fs.readFileSync(tCat, 'utf8');
            
            const rNav = str.substring(str.indexOf('<div class="bottom-nav">'), str.indexOf('<div class="sheet" id="selection-modal">'));
            str = str.replace(rNav, bottomNavBlock);
            
            const rChat = str.substring(str.indexOf('function renderAdminChatMessages()'), str.indexOf('async function pollUpdatesSilent()'));
            str = str.replace(rChat, clientChatLogicBlock);
            
            const rSupport = str.substring(str.indexOf('<div style="display:flex; gap:10px; margin-top:15px; position:relative;">'), str.indexOf('</div>\n    </div>\n\n    <script>'));
            str = str.replace(rSupport, supportInputBlock);
            
            // Replace initDataUnsafe.user.id with getTgUser()?.id
            str = str.replace(/tg\.initDataUnsafe\?\.user\?\.id/g, "getTgUser()?.id");
            str = str.replace(/tg\.initDataUnsafe\?\.user\?\.first_name/g, "getTgUser()?.first_name");
            str = str.replace(/tg\.initDataUnsafe\?\.user\?\.username/g, "getTgUser()?.username");

            fs.writeFileSync(tCat, str);
        }

        // 4. Dashboard
        const tDash = path.join(t, 'web/views/dashboard.html');
        if (fs.existsSync(tDash)) {
            let str = fs.readFileSync(tDash, 'utf8');
            
            const rModal = str.substring(str.indexOf('<div class="chat-reply-input"'), str.indexOf('<!-- JS -->'));
            str = str.replace(rModal, chatModalBlock);
            
            const rRender = str.substring(str.indexOf('function openChatReplyModal'), str.indexOf('async function applyOrderAction'));
            str = str.replace(rRender, renderChatBlock);

            if (!str.includes('let adminMediaRecorder;')) {
                str = str.replace('window.onclick = function(e)', adminRecordBlock + '\n        window.onclick = function(e)');
            } else {
                const oldRec = str.substring(str.indexOf('let adminMediaRecorder;'), str.indexOf('window.onclick = function(e)'));
                str = str.replace(oldRec, adminRecordBlock);
            }
            
            fs.writeFileSync(tDash, str);
        }
    });

    console.log("ALL PATCHED!");
} catch (err) {
    console.error(err);
}
