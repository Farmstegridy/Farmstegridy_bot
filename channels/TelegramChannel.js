const { Telegraf, Markup } = require('telegraf');
const { Channel } = require('./Channel');
const path = require('path');
const https = require('https');
const http = require('http');

async function downloadToBuffer(url) {
    if (typeof url !== 'string' || !url.startsWith('http')) return null;
    return new Promise((resolve) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { timeout: 10000 }, (res) => {
            if (res.statusCode !== 200) return resolve(null);
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.length > 0 ? buffer : null);
            });
            res.on('error', () => resolve(null));
        }).on('error', () => resolve(null));
    });
}

class TelegramChannel extends Channel {
    constructor(token) {
        super('telegram', 'Telegram');
        // Nettoyage agressif du token (trim et suppression des caractères parasites comme \n, \r ou =)
        let cleanToken = (token || '').trim();
        if (cleanToken.startsWith('=')) {
            cleanToken = cleanToken.substring(1).trim();
        }
        this.token = cleanToken;
        this.bot = null;
        this.messageHandler = null;
    }

    onMessage(handler) {
        this.messageHandler = handler;
    }

    _resolveMedia(url) {
        if (typeof url === 'string' && url.startsWith('/public/')) {
            return { source: path.join(__dirname, '..', 'web', url) };
        }
        return url;
    }

    async initialize() {
        this.bot = new Telegraf(this.token);

        this.bot.use(async (ctx, next) => {
            const start = Date.now();
            await next();
            const ms = Date.now() - start;
            if (ctx.from) {
                console.log(
                    `[TG] @${ctx.from.username || ctx.from.id} — ${ctx.updateType} (${ms}ms)`
                );
            }
        });

        this.bot.catch((err, ctx) => {
            console.error('[TG] Erreur Global:', err.message);
        });

        // Relayer tout vers le dispatcher
        this.bot.on('message', async (ctx) => {
            console.log(`[TG-DEBUG] Message reçu de ${ctx.from.id}: "${ctx.message.text ||'NO_TEXT'}"`);
            if (this.messageHandler) {
                await this.messageHandler({
                    from: ctx.from.id,
                    name: ctx.from.first_name,
                    text: ctx.message.text || ctx.message.caption,
                    photo: ctx.message.photo,
                    video: ctx.message.video,
                    message_id: ctx.message.message_id,
                    type: 'message',
                    ctx: ctx // On garde le ctx original pour compatibilité ascendante si besoin
                });
            }
        });

        this.bot.on('callback_query', async (ctx) => {
            console.log(`[TG-CB] Callback reçu: "${ctx.callbackQuery.data}" de ${ctx.from.id}`);
            if (this.messageHandler) {
                await this.messageHandler({
                    from: ctx.from.id,
                    name: ctx.from.first_name,
                    text: ctx.callbackQuery.data,
                    type: 'callback_query',
                    isAction: true,
                    ctx: ctx
                });
            } else {
                console.error('[TG-CB] ERREUR: Pas de messageHandler !');
            }
        });
    }

    async start() {
        if (this.isActive) {
            console.log('[TG] Telegram channel is already active. Skipping start.');
            return;
        }

        // --- DISTRIBUTED LOCK ---
        const { claimLock, checkLock } = require('../services/database');
        
        // Use a stable ID for the replica (index is better than PID for reboots)
        const replicaIndex = process.env.RAILWAY_REPLICA_INDEX || 0;
        const processUniqueId = Math.random().toString(36).substring(2, 8);
        const instanceId = `replica-${replicaIndex}-${processUniqueId}`;
        const telegramLockId = `tg_lock`;

        try {
            const lock = await checkLock(telegramLockId);
            
            // If lock exists and isn't ours, check if it's expired
            if (lock && lock.owner && lock.owner !== instanceId) {
                const now = Date.now();
                const expiresAtDate = new Date(lock.expires).getTime();
                
                if (expiresAtDate > now) {
                    const expiresAt = new Date(lock.expires).toLocaleTimeString();
                    console.log(`[TG-LOCK] ⚠️ Session busy (Owner: ${lock.owner}, Expires: ${expiresAt}). Retrying in 30s...`);
                    setTimeout(() => this.start(), 30000);
                    return;
                }
            }

            // Try to claim
            const claimed = await claimLock(telegramLockId, instanceId);
            if (!claimed) {
                console.log(`[TG-LOCK] ❌ Claim failed. Retrying in 30s...`);
                setTimeout(() => this.start(), 30000);
                return;
            }

            console.log(`[TG-LOCK] 🎉 Lock obtained by ${instanceId}. launching bot...`);
            
            // Launch bot via heartbeat
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = setInterval(async () => {
                await claimLock(telegramLockId, instanceId);
            }, 45000); // refresh every 45s (lock TTL is 60s)
        } catch (err) {
            console.error('[TG-LOCK] Error during lock sequence:', err);
            setTimeout(() => this.start(), 30000);
            return;
        }

        console.log(`[TG-LOCK] Telegram lock claimed by ${instanceId}`);
        console.log(`[TG] Lancement du bot (${this.token.substring(0, 4)}****...)...`);
        
        // Build launch options
        const launchOptions = {
            drop_pending_updates: true,
            allowedUpdates: ['message', 'callback_query']
        };

        const launch = async (retryCount = 0) => {
            try {
                this.isActive = true;
                // Launch the bot. We use Promise.race to detect early startup errors (like 409 conflict)
                // without hanging the start() sequence indefinitely.
                await Promise.race([
                    this.bot.launch(launchOptions).then(() => {
                        console.log('✅ [TG] Bot arrêté.');
                        this.isActive = false;
                    }),
                    new Promise((resolve) => {
                        setTimeout(() => {
                            resolve();
                        }, 5000);
                    })
                ]);
                console.log('✅ [TG] Bot lancé avec succès !');
            } catch (err) {
                this.isActive = false;
                if (err.message && err.message.includes('409') && retryCount < 5) {
                    console.warn(`⚠️ [TG] Conflit 409 (déjà une instance). Tentative ${retryCount + 1}/5 dans 15s...`);
                    setTimeout(() => launch(retryCount + 1), 15000);
                } else {
                    console.error('❌ [TG] Erreur fatale au lancement:', err.message || err);
                    if (this.heartbeatInterval) {
                        clearInterval(this.heartbeatInterval);
                        this.heartbeatInterval = null;
                    }
                }
            }
        };

        launch();
        // On marque isActive true temporairement pour le registry, 
        // ou on laisse le launch s'en occuper. Ici on dit qu'il est "initialisé".
        console.log('  Telegram channel initialized and launching in background...');
    }

    async stop() {
        if (this.bot) this.bot.stop('SIGTERM');
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.isActive = false;
    }

    async sendMessage(chatId, text, options = {}) {
        console.log(`[TG] Tentative d'envoi à ${chatId}...`);
        try {
            // Si options contient media_url, on redirige
            if (options.media_url) {
                if (options.media_type === 'multiple') {
                    try {
                        const mediaArray = JSON.parse(options.media_url);
                        return this.sendMediaGroup(chatId, mediaArray, text, options);
                    } catch (e) {
                        console.error("JSON Parse multiple failed:", e);
                    }
                } else if (options.media_type === 'video') {
                    return this.sendVideo(chatId, options.media_url, text, options);
                } else {
                    return this.sendPhoto(chatId, options.media_url, text, options);
                }
            }

            // Vérifier si le texte contient du HTML intentionnel
            const hasHtmlTags = text && text.match(/<[a-z/][\s\S]*>/i);

            let finalMsg = text || '';
            if (!hasHtmlTags) {
                finalMsg = finalMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            const extra = { parse_mode: 'HTML' };
            if (options.reply_markup) extra.reply_markup = options.reply_markup;
            else if (options.inline_keyboard || options.keyboard) extra.reply_markup = options;
            if (options.protect_content) extra.protect_content = true;

            const result = await this.bot.telegram.sendMessage(chatId, finalMsg, extra);
            return { success: true, messageId: result?.message_id, message_id: result?.message_id };
        } catch (error) {
            console.error(`[TG] Erreur d'envoi à ${chatId}:`, error.message);
            return this._handleError(error);
        }
    }

    async sendPhoto(chatId, url, caption, options = {}) {
        try {
            const extra = { parse_mode: 'HTML', caption: caption || '' };
            if (options.reply_markup) extra.reply_markup = options.reply_markup;
            else if (options.inline_keyboard || options.keyboard) extra.reply_markup = options;
            if (options.protect_content) extra.protect_content = true;

            try {
                const result = await this.bot.telegram.sendPhoto(chatId, this._resolveMedia(url), extra);
                return { success: true, messageId: result?.message_id, message_id: result?.message_id };
            } catch (err) {
                const desc = String(err.description || '').toLowerCase();
                if (desc.includes('wrong type of the web page content') || desc.includes('file too large')) {
                    console.log(`[TG] URL photo failed (${desc}), retrying with buffer...`);
                    const buf = await downloadToBuffer(url);
                    if (buf) {
                        const result = await this.bot.telegram.sendPhoto(chatId, { source: buf }, extra);
                        return { success: true, messageId: result?.message_id, message_id: result?.message_id };
                    }
                }
                throw err;
            }
        } catch (error) {
            console.error(`[TG] Erreur photo à ${chatId}:`, error.message);
            return this._handleError(error);
        }
    }

    async sendVideo(chatId, url, caption, options = {}) {
        try {
            const extra = { parse_mode: 'HTML', caption: caption || '' };
            if (options.reply_markup) extra.reply_markup = options.reply_markup;
            else if (options.inline_keyboard || options.keyboard) extra.reply_markup = options;
            if (options.protect_content) extra.protect_content = true;

            try {
                const result = await this.bot.telegram.sendVideo(chatId, this._resolveMedia(url), extra);
                return { success: true, messageId: result?.message_id, message_id: result?.message_id };
            } catch (err) {
                const desc = String(err.description || '').toLowerCase();
                if (desc.includes('wrong type of the web page content') || desc.includes('file too large')) {
                    console.log(`[TG] URL video failed (${desc}), retrying with buffer...`);
                    const buf = await downloadToBuffer(url);
                    if (buf) {
                        const result = await this.bot.telegram.sendVideo(chatId, { source: buf }, extra);
                        return { success: true, messageId: result?.message_id, message_id: result?.message_id };
                    }
                }
                throw err;
            }
        } catch (error) {
            console.error(`[TG] Erreur vidéo à ${chatId}:`, error.message);
            return this._handleError(error);
        }
    }

    async sendMediaGroup(chatId, mediaArray, caption, options = {}) {
        const buildMedia = (arr, useBufferMap = null) => {
            return arr.map((m, index) => {
                const item = {
                    type: m.type || (m.url?.match(/\.(mp4|mov|avi|wmv|webm|mkv)/i) ? 'video' : 'photo'),
                    media: (useBufferMap && useBufferMap[index]) ? { source: useBufferMap[index] } : this._resolveMedia(m.url),
                };
                if (index === 0) {
                    item.caption = caption;
                    item.parse_mode = 'HTML';
                }
                return item;
            });
        };

        try {
            try {
                const results = await this.bot.telegram.sendMediaGroup(chatId, buildMedia(mediaArray));
                const firstId = Array.isArray(results) ? results[0]?.message_id : results?.message_id;
                return { success: true, messageId: firstId, message_id: firstId };
            } catch (err) {
                const desc = String(err.description || '').toLowerCase();
                if (desc.includes('wrong type of the web page content') || desc.includes('file too large')) {
                    console.log(`[TG] MediaGroup URL failed (${desc}), downloading to buffers...`);
                    const bufferMap = {};
                    for (let i = 0; i < mediaArray.length; i++) {
                        bufferMap[i] = await downloadToBuffer(mediaArray[i].url);
                    }
                    // Filter out failed downloads
                    if (Object.values(bufferMap).every(b => b !== null)) {
                        const results = await this.bot.telegram.sendMediaGroup(chatId, buildMedia(mediaArray, bufferMap));
                        const firstId = Array.isArray(results) ? results[0]?.message_id : results?.message_id;
                        return { success: true, messageId: firstId, message_id: firstId };
                    }
                }
                throw err;
            }
        } catch (error) {
            console.error(`[TG] Erreur MediaGroup à ${chatId}:`, error.message);
            return this._handleError(error);
        }
    }

    async sendInteractive(userId, text, buttons = [], options = {}) {
        // En Telegram, interactiveButtons = Inline Keyboard
        const keyboard = buttons.map((b) => {
            // Sécurité: si c'est un lien URL
            if (b.url) return [Markup.button.url(b.title, b.url)];
            // Si c'est un webApp
            if (b.web_app) return [Markup.button.webApp(b.title, b.web_app.url || b.web_app)];
            // Sinon c'est un callback
            return [Markup.button.callback(b.title, b.id)];
        });

        const sendOpts = {
            reply_markup: { inline_keyboard: keyboard },
            protect_content: options.protect_content || false
        };

        // Si un média est fourni dans les options, on l'envoie avec le clavier
        if (options.media_url) {
            let mediaType = options.media_type || null;
            // Fallback: détection par extension si media_type manquant
            if (!mediaType) {
                const videoExts = /\.(mp4|mov|avi|mkv|webm|m4v)(\?.*)?$/i;
                mediaType = videoExts.test(options.media_url) ? 'video' : 'photo';
            }
            if (mediaType === 'video') {
                return this.sendVideo(userId, options.media_url, text, sendOpts);
            } else {
                return this.sendPhoto(userId, options.media_url, text, sendOpts);
            }
        }

        return this.sendMessage(userId, text, sendOpts);
    }

    _handleError(error) {
        const code = error.response?.error_code;
        const desc = error.response?.description || error.message;
        const BLOCKED_SIGNALS = ['bot was blocked', 'user is deactivated', 'chat not found'];

        const result = { success: false, error: desc };

        if (code === 403 || BLOCKED_SIGNALS.some((s) => desc.includes(s))) {
            result.blocked = true;
        } else if (code === 429) {
            result.rateLimited = true;
            result.retryAfter = error.response?.parameters?.retry_after || 5;
        }
        return result;
    }

    getCapabilities() {
        return {
            hasSessionWindow: false,
            supportsHTML: true,
            supportsInlineKeyboard: true,
            supportsInteractiveButtons: true,
        };
    }

    getBotInstance() { return this.bot; }
}

module.exports = { TelegramChannel };
