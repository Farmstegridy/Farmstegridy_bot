const { getAllUsersForBroadcast, saveBroadcast, updateBroadcast, markUserBlocked, getPendingBroadcasts } = require('./database');
const fs = require('fs');
const path = require('path');

function ts() { return new Date().toISOString(); }

function debugLog(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(path.join(process.cwd(), 'debug_shop.log'), line);
    } catch (e) { }
    console.log(msg);
}

// Configuration des délais
const CONCURRENCY_LIMIT = 5; 
const BATCH_DELAY_MS = 300; 
const TELEGRAM_TIMEOUT_MS = 15000; 

let _bot = null;
function setBroadcastBot(bot) { 
    _bot = bot; 
    debugLog(`[BC-SERVICE] Bot Telegram lié à la diffusion.`);
}

async function _waitForReady() {
    let attempts = 0;
    while (!_bot && attempts < 10) {
        debugLog(`[BC-WAIT] En attente du bot Telegram... (essai ${attempts + 1}/10)`);
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
    }
    return !!_bot;
}

function _isBroadcastPrivileged(user) {
    if (user?.is_livreur) return true;
    const cleanId = String(user?.platform_id || '').match(/\d+/g)?.[0] || '';
    const adminIds = String(process.env.ADMIN_TELEGRAM_ID || '').match(/\d+/g) || [];
    return adminIds.includes(cleanId);
}

async function broadcastMessage(platform, message, options = {}) {
    const {
        mediaFiles = [],
        mediaUrls: existingUrls = [],
        start_at = ts(),
        end_at = null,
        badge = null,
        poll_options = null,
        poll_allow_free = false
    } = options;

    let finalMessage = message;
    let finalMediaUrls = [...existingUrls];

    if (message && typeof message === 'string' && message.includes('|||MEDIA_URLS|||')) {
        const parts = message.split('|||MEDIA_URLS|||');
        finalMessage = parts[0];
        try {
            const extraUrls = JSON.parse(parts[1]);
            if (Array.isArray(extraUrls)) {
                finalMediaUrls = [...finalMediaUrls, ...extraUrls];
            }
        } catch (e) {
            debugLog(`[BC-PARSE-ERR] ${e.message}`);
        }
    }

    debugLog(`[BC-START] Plateforme: ${platform}, Médias: ${mediaFiles.length}, URLs: ${finalMediaUrls.length}`);

    const isReady = await _waitForReady();
    if (!isReady) {
        debugLog(`[BC-ERROR] Impossible de lancer la diffusion: Bot non prêt.`);
        return { success: 0, failed: 0, blocked: 0, total: 0 };
    }

    // Map platform string to bType: null = tous les utilisateurs
    let bType = null;
    if (platform === 'users') bType = 'user';
    else if (platform === 'groups') bType = 'group';
    else if (platform === 'livreurs') bType = 'livreurs';
    else bType = null; // 'all' or anything else → tous les utilisateurs

    const targets = await getAllUsersForBroadcast(null, bType);
    const totalTargets = targets.length;

    const now = new Date();
    const startTime = new Date(start_at);
    const isFuture = startTime > now;

    if (totalTargets === 0) {
        return { success: 0, failed: 0, blocked: 0, total: 0 };
    }

    const unifiedMediaList = [...finalMediaUrls.map(u => (typeof u === 'string' ? { url: u, type: u.match(/\.(mp4|mov|avi|wmv|webm|mkv|m4v|3gp|flv|quicktime|ogv)/i) ? 'video' : 'photo' } : u))];
    const { uploadMediaBuffer } = require('./database');
    
    for (let f of mediaFiles) {
        try {
            const extension = f.mimetype.includes('video') ? 'mp4' : 'jpg';
            const fileName = `bc-${Date.now()}-${Math.round(Math.random() * 1E9)}-${f.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
            const fileBuffer = f.data || (f.tempFilePath ? fs.readFileSync(f.tempFilePath) : null);

            if (fileBuffer) {
                const publicUrl = await uploadMediaBuffer(fileBuffer, fileName, f.mimetype);
                unifiedMediaList.push({ url: publicUrl, type: f.mimetype.includes('video') ? 'video' : 'photo' });
            }
        } catch (e) { debugLog(`[BC-UPLOAD-ERR] ${e.message}`); }
    }

    const mediaUrlsJson = JSON.stringify(unifiedMediaList.filter(m => m.url).map(m => ({ url: m.url, type: m.type || 'photo' })));
    const payloadMessage = `${finalMessage}|||MEDIA_URLS|||${mediaUrlsJson}`;

    debugLog(`[BC-PREPARED] Msg: ${finalMessage.substring(0, 20)}..., Médias: ${unifiedMediaList.length}`);

    let broadcastId = options.id || await saveBroadcast({
        message: payloadMessage,
        media_count: unifiedMediaList.length,
        total_target: totalTargets,
        target_platform: platform,
        status: isFuture ? 'pending' : 'in_progress',
        success: 0, failed: 0, blocked: 0,
        start_at,
        end_at
    });

    if (isFuture) return { success: 0, failed: 0, blocked: 0, total: totalTargets, scheduled: true, broadcastId };

    let successCount = 0;
    let failedCount = 0;
    let newlyBlockedCount = 0;
    let previouslyBlockedCount = 0;

    const seenPlatformIds = new Set();
    const eligibleTargets = targets.filter(u => {
        if (u.is_blocked) { previouslyBlockedCount++; return false; }
        const pid = String(u.platform_id || '').replace('telegram_', '');
        if (seenPlatformIds.has(pid)) return false;
        seenPlatformIds.add(pid);
        return true;
    });


    const { translate } = require('./translator');
    const langs = ['en', 'es', 'de'];
    const translatedMessages = { fr: finalMessage };
    if (!_isBroadcastPrivileged({ is_livreur: platform === 'livreurs' })) {
        for (const l of langs) {
            try {
                translatedMessages[l] = await translate(finalMessage, l);
            } catch(e) {
                translatedMessages[l] = finalMessage;
            }
        }
    }

    const { default: pLimit } = await import('p-limit');

    const limit = pLimit(CONCURRENCY_LIMIT);

    await Promise.allSettled(eligibleTargets.map(user => limit(async () => {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        const cleanChatId = String(user.platform_id || '').replace('telegram_', '');
        const userLang = (user.data && user.data.language) ? user.data.language : 'fr';
        const localizedMessage = translatedMessages[userLang] || translatedMessages['fr'];

        debugLog(`[BC-SENDING] To ${cleanChatId}, Média count: ${unifiedMediaList.length}`);
        const res = await sendToUser(user, finalMessage, unifiedMediaList, { ...options, broadcastId });
        if (res.success) successCount++;
        else res.blocked ? newlyBlockedCount++ : failedCount++;

        if ((successCount + failedCount + newlyBlockedCount) % 10 === 0) {
            await updateBroadcast(broadcastId, { success: successCount, failed: failedCount, blocked: newlyBlockedCount + previouslyBlockedCount }).catch(() => {});
        }
    })));

    await updateBroadcast(broadcastId, {
        status: 'completed',
        success: successCount,
        failed: failedCount,
        blocked: newlyBlockedCount + previouslyBlockedCount,
        completed_at: ts()
    }).catch(() => {});

    return { success: successCount, failed: failedCount, total: totalTargets, broadcastId };
}

async function sendToUser(user, message, unifiedMediaList = [], options = {}) {
    if (!_bot) return { success: false, error: "Bot non prêt" };

    const chatId = String(user.platform_id || '').replace('telegram_', '');
    const { Markup } = require('telegraf');
    const poll_options = options.poll_options?.split('|') || null;
    const broadcastId = options.broadcastId;
    
    let finalMessage = message;
    let finalPollOptions = poll_options;
    
    // Server-side translation
    const lang = user.language_code || 'fr';
    if (lang !== 'fr') {
        try {
            const { translate } = require('./translator');
            if (finalMessage) {
                finalMessage = await translate(finalMessage, lang);
            }
            if (finalPollOptions) {
                finalPollOptions = await Promise.all(finalPollOptions.map(o => translate(o, lang)));
            }
        } catch (e) {
            console.error('[BC-TRANSLATE-ERR]', e.message);
        }
    }

    let keyboard = null;
    if (finalPollOptions) {
        const btns = finalPollOptions.map((opt, idx) => [Markup.button.callback(opt, `poll_vote_${broadcastId}_${idx}`)]);
        if (options.poll_allow_free) btns.push([Markup.button.callback('🖊 Réponse libre', `poll_free_${broadcastId}`)]);
        keyboard = Markup.inlineKeyboard(btns);
    }

    const _protect = !_isBroadcastPrivileged(user);
    const caption = finalMessage ? (finalMessage.length > 1020 ? finalMessage.substring(0, 1017) + '...' : finalMessage) : '';

    try {
        if (unifiedMediaList.length > 1) {
            const mediaGroup = unifiedMediaList.slice(0, 10).map((m, i) => ({
                type: m.type,
                media: m.file_id || m.url,
                ...(i === 0 && caption ? { caption, parse_mode: 'HTML' } : {})
            }));
            await _bot.bot.telegram.sendMediaGroup(chatId, mediaGroup, _protect ? { protect_content: true } : {});
        } else if (unifiedMediaList.length === 1) {
            const m = unifiedMediaList[0];
            const method = m.type === 'video' ? 'sendVideo' : 'sendPhoto';
            await _bot.bot.telegram[method](chatId, m.file_id || m.url, { caption, parse_mode: 'HTML', ...(_protect ? { protect_content: true } : {}), ...(keyboard || {}) });
        } else {
            await _bot.bot.telegram.sendMessage(chatId, finalMessage, { parse_mode: 'HTML', ...(_protect ? { protect_content: true } : {}), ...(keyboard || {}) });
        }
        return { success: true };
    } catch (error) {
        const desc = (error.description || error.message || "").toLowerCase();
        const isBlocked = error.code === 403 || desc.includes('blocked') || desc.includes('chat not found') || desc.includes('deactivated');
        if (isBlocked && (user.id || user.doc_id)) await markUserBlocked(user.id || user.doc_id, false).catch(() => {});
        return { success: false, blocked: isBlocked, error: desc };
    }
}

let isProcessing = false;
async function processPendingBroadcasts() {
    if (isProcessing) return;
    isProcessing = true;
    try {
        const pendings = await getPendingBroadcasts();
        for (const bc of pendings) {
            await updateBroadcast(bc.id, { status: 'in_progress' }).catch(() => {});
            await broadcastMessage(bc.target_platform, bc.message || "", { id: bc.id, start_at: bc.start_at, poll_options: bc.poll_data?.options?.join('|') });
        }
    } catch (e) { debugLog(`[BC-WORKER-ERR] ${e.message}`); } finally { isProcessing = false; }
}

async function startBroadcastWorker(telegramChannel) {
    setBroadcastBot(telegramChannel);
    debugLog(`[BC-WORKER] Worker de diffusion lancé.`);
    setInterval(async () => {
        await processPendingBroadcasts();
    }, 30000); // Toutes les 30 secondes
}

module.exports = { 
    broadcastMessage, 
    setBroadcastBot, 
    processPendingBroadcasts, 
    startBroadcastWorker 
};
