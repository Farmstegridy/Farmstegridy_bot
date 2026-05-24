const { getLastMenuId, getTrackedMessages, addMessageToTrack, getUser } = require('./database');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

async function downloadToBuffer(url) {
    if (typeof url !== 'string') return null;
    if (url.includes('/public/')) {
        try {
            const parts = url.split('/public/');
            const relativePath = parts[parts.length - 1];
            const localPath = path.join(__dirname, '..', 'web', 'public', relativePath);
            if (fs.existsSync(localPath)) {
                return fs.readFileSync(localPath);
            }
        } catch (e) {
            console.error('[downloadToBuffer] Local read failed:', e.message);
        }
    }
    if (!url.startsWith('http')) return null;
    return new Promise((resolve) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.length > 0 ? buffer : null);
            });
            res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

/**
 * L'Unique porte de sortie pour les menus du bot.
 * Garantit qu'un seul message de menu existe à la fois (Flux Constant).
 */

const _trackedCache = new Map();
const _editLocks = new Map();
const _activeMediaGroup = new Map();

function setActiveMediaGroup(userId, msgIds) {
    _activeMediaGroup.set(userId, msgIds);
}

function clearActiveMediaGroup(userId) {
    _activeMediaGroup.delete(userId);
}

function getActiveMediaGroup(userId) {
    return _activeMediaGroup.get(userId) || [];
}

function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function safeEdit(ctx, text, opts = {}) {
    const isGroup = ctx.chat?.type !== 'private';
    const userId = isGroup ? `${ctx.platform}_${ctx.chat.id}` : `${ctx.platform}_${ctx.from.id}`;
    const chatId = ctx.chat?.id;

    if (!chatId) {
        console.error('[SAFE-EDIT] No chat ID available');
        return;
    }

    const now = Date.now();
    const lastEdit = _editLocks.get(userId);
    if (lastEdit && (now - lastEdit < 500)) return;
    _editLocks.set(userId, now);

    let photo = opts.photo || null;
    if (photo === '') photo = null;
    let isDetectedVideo = false;

    if (photo) {
        if (Array.isArray(photo)) {
            if (photo.length > 0) {
                const p0 = photo[0];
                if (p0.type === 'video') isDetectedVideo = true;
                photo = typeof p0 === 'string' ? p0 : (p0.url || p0.path || '');
            } else photo = null;
        }
        if (photo && typeof photo === 'string') {
            const cp = photo.trim();
            if (cp.startsWith('[') && cp.endsWith(']')) {
                try {
                    const arr = JSON.parse(cp);
                    if (arr && arr.length > 0) {
                        const p0 = arr[0];
                        if (p0.type === 'video') isDetectedVideo = true;
                        photo = typeof p0 === 'string' ? p0 : (p0.url || p0.path || '');
                    } else photo = null;
                } catch (e) {
                    photo = cp.replace(/[\[\]"']/g, '').split(',')[0].trim();
                }
            } else if (cp.includes(',') && !cp.startsWith('http')) {
                photo = cp.split(',')[0].trim();
            } else photo = cp;
        }
    }
    
    let video = opts.video || null;
    if (isDetectedVideo && photo && !video) {
        video = photo;
        photo = null;
    }
    let reply_markup = opts.reply_markup || (opts.inline_keyboard ? opts : (Array.isArray(opts) ? { inline_keyboard: opts } : null));
    if (reply_markup && reply_markup.reply_markup) reply_markup = reply_markup.reply_markup;
    const extra = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup };

    const currentMsg = ctx.callbackQuery?.message;

    const deleteSingleMessage = async (messageId) => {
        if (!messageId) return;
        try {
            if (ctx.platform === 'telegram' && ctx.telegram) {
                await ctx.telegram.deleteMessage(chatId, messageId).catch(() => { });
            }
        } catch (e) { }
    };

    const cleanupOrphans = (keepId) => {
        (async () => {
            try {
                let tracked = _trackedCache.get(userId) || [];
                if (tracked.length === 0) {
                    tracked = await getTrackedMessages(userId).catch(() => []);
                }
                const protectedIds = new Set([String(keepId)]);
                const mgIds = _activeMediaGroup.get(userId) || [];
                mgIds.forEach(id => protectedIds.add(String(id)));

                const toDelete = tracked.filter(id => !protectedIds.has(String(id)));
                if (toDelete.length > 0) {
                    const batch = toDelete.slice(0, 20);
                    await Promise.allSettled(batch.map(id => deleteSingleMessage(id)));
                }
                const remaining = toDelete.slice(20);
                _trackedCache.set(userId, [...new Set([...remaining, ...[...protectedIds].map(Number).filter(Boolean)])]);
            } catch (e) {
                console.error(`[CLEANUP] Erreur: ${e.message}`);
            }
        })();
    };
    try {
        if (currentMsg && ctx.telegram) {
            const currentMsgId = currentMsg.message_id;
            const isMediaMsg = !!(currentMsg.photo || currentMsg.video);
            const wantMedia = !!(photo || video);

            if (isMediaMsg === wantMedia) {
                try {
                    if (photo || video) {
                        try {
                            const mediaObj = {
                                type: photo ? 'photo' : 'video',
                                media: photo || video,
                                caption: text,
                                parse_mode: 'HTML'
                            };
                            await ctx.telegram.editMessageMedia(chatId, currentMsgId, null, mediaObj, { reply_markup });
                            } catch (mediaErr) {
                                console.log('[SAFE-EDIT] Retry media edit with buffer (url failure)...');
                                const buf = await downloadToBuffer(photo || video);
                                if (buf) {
                                    await ctx.telegram.editMessageMedia(chatId, currentMsgId, null, {
                                        type: photo ? 'photo' : 'video',
                                        media: { source: buf },
                                        caption: text,
                                        parse_mode: 'HTML'
                                    }, { reply_markup });
                                } else throw mediaErr;
                            }
                    } else {
                        await ctx.telegram.editMessageText(chatId, currentMsgId, null, text, { parse_mode: 'HTML', ...extra });
                    }
                    addMessageToTrack(userId, currentMsgId).catch(() => { });
                    cleanupOrphans(currentMsgId);
                    return;
                } catch (e) {
                    const desc = String(e.description || '').toLowerCase();
                    if (desc.includes('not modified')) return;
                    console.warn('[SAFE-EDIT] Edit failed, fallback to send:', e.message);
                }
            }

            let newMsg;
            try {
                if (photo || video) {
                    try {
                        if (photo) newMsg = await ctx.replyWithPhoto(photo, { caption: text, ...extra });
                        else newMsg = await ctx.replyWithVideo(video, { caption: text, ...extra });
                        
                        if (newMsg && newMsg.success === false) throw new Error('Media reply failed: ' + newMsg.error);
                    } catch (replyErr) {
                            console.log('[SAFE-EDIT] Retry media reply with buffer...', replyErr.message);
                            const buf = await downloadToBuffer(photo || video);
                            if (buf) {
                                if (photo) newMsg = await ctx.replyWithPhoto({ source: buf }, { caption: text, ...extra });
                                else newMsg = await ctx.replyWithVideo({ source: buf }, { caption: text, ...extra });
                                
                                if (newMsg && newMsg.success === false) throw new Error('Media reply with buffer failed');
                            } else throw replyErr;
                    }
                } else {
                    newMsg = await ctx.replyWithHTML(text, extra);
                }
            } catch (err) {
                newMsg = await ctx.replyWithHTML(text, extra);
            }

            const newMsgId = newMsg?.message_id || newMsg?.messageId;
            if (newMsgId) {
                deleteSingleMessage(currentMsgId);
                cleanupOrphans(newMsgId);
                addMessageToTrack(userId, newMsgId).catch(() => { });
            }
            return;
        }

        let newMsg;
        if (photo || video) {
            try {
                try {
                    if (photo) newMsg = await ctx.replyWithPhoto(photo, { caption: text, ...extra });
                    else newMsg = await ctx.replyWithVideo(video, { caption: text, ...extra });
                    
                    if (newMsg && newMsg.success === false) throw new Error('Media reply failed: ' + newMsg.error);
                } catch (err) {
                        console.log('[SAFE-EDIT] Retry media reply with buffer (no msg match)...', err.message);
                        const buf = await downloadToBuffer(photo || video);
                        if (buf) {
                            if (photo) newMsg = await ctx.replyWithPhoto({ source: buf }, { caption: text, ...extra });
                            else newMsg = await ctx.replyWithVideo({ source: buf }, { caption: text, ...extra });
                            
                            if (newMsg && newMsg.success === false) throw new Error('Media reply with buffer failed');
                        } else throw err;
                }
            } catch (err) {
                newMsg = await ctx.replyWithHTML(text, extra);
            }
        } else {
            newMsg = await ctx.replyWithHTML(text, extra);
        }

        if (newMsg) {
            const newMsgId = newMsg.message_id || newMsg.messageId;
            if (newMsgId) {
                cleanupOrphans(newMsgId);
                addMessageToTrack(userId, newMsgId).catch(() => { });
            }
        }

    } catch (e) {
        console.error('❌ safeEdit Fatal:', e.message);
        try {
            const fb = await ctx.replyWithHTML(text, extra);
            if (fb) {
                const fbId = fb.message_id || fb.messageId;
                if (fbId) addMessageToTrack(userId, fbId).catch(() => { });
            }
        } catch (err) { }
    }
}

async function trackIntermediateMessage(userId, messageId) {
    const existing = _trackedCache.get(userId) || [];
    if (!existing.includes(messageId)) {
        existing.push(messageId);
        if (existing.length > 50) existing.shift();
        _trackedCache.set(userId, existing);
    }
}

async function cleanupUserChat(ctx, keepId = null) {
    const isGroup = ctx.chat?.type !== 'private';
    const userId = isGroup ? `${ctx.platform}_${ctx.chat.id}` : `${ctx.platform}_${ctx.from.id}`;
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
        let tracked = _trackedCache.get(userId) || [];
        const toDelete = tracked.filter(id => String(id) !== String(keepId));
        if (toDelete.length > 0) {
            for (let i = 0; i < toDelete.length; i += 10) {
                const batch = toDelete.slice(i, i + 10);
                await Promise.allSettled(batch.map(id => {
                    if (ctx.platform === 'telegram') return ctx.telegram.deleteMessage(chatId, id).catch(() => {});
                }));
            }
        }
        _trackedCache.set(userId, keepId ? [keepId] : []);
    } catch (e) {
        console.error('[CLEANUP-CHAT] Failed:', e.message);
    }
}

module.exports = { 
    safeEdit, 
    esc, 
    trackIntermediateMessage, 
    cleanupUserChat, 
    setActiveMediaGroup, 
    clearActiveMediaGroup, 
    getActiveMediaGroup 
};
