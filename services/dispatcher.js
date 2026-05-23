const { registry } = require('../channels/ChannelRegistry');
const { getAppSettings, registerUser, addMessageToTrack } = require('./database');
const { notifyAdmins } = require('./notifications');
const { createPersistentMap } = require('./persistent_map');

// Logger générique
const waLog = (msg, data = '') => console.log(`[Dispatcher] ${msg}`, data);

class Dispatcher {
    constructor() {
        this.channels = new Map();
        this.commands = new Map();
        this.actions = new Map();
        this.middleware = [];
        this.onHandlers = [];
        this.catchHandler = null;
        this.userLastMessageIds = createPersistentMap('userLastMessageIds');
    }

    registerChannel(name, channel) {
        this.channels.set(name, channel);
        try {
            const { registry } = require('../channels/ChannelRegistry');
            registry.register(channel);
        } catch (e) {
            waLog(`[WARNING] Échec enregistrement registry pour ${name}: ${e.message}`);
        }
        if (channel.onMessage) {
            channel.onMessage((msg) => this.handleUpdate(channel, msg));
        }
        waLog(`[DISPATCHER] Registration ${name} OK`);
    }

    async initChannels() {
        waLog(`[DISPATCHER] Initialisation de ${this.channels.size} canaux...`);
        const results = {};
        for (const [name, channel] of this.channels) {
            try {
                await channel.initialize();
                results[name] = channel;
                waLog(`[DISPATCHER] Canal ${name} prêt`);
            } catch (e) {
                waLog(`[DISPATCHER] Canal ${name} erreur: ${e.message}`);
            }
        }
        return results;
    }

    _normalizeId(id) {
        if (!id) return id;
        // Pour Telegram, on garde l'ID propre (souvent numérique ou avec telegram_)
        return String(id).replace('telegram_', '');
    }

    async init() {
        await this.userLastMessageIds.load();
        waLog("Dispatcher initialisé.");
    }

    // --- Interface pour simuler Telegraf ---
    use(fn) { this.middleware.push(fn); }
    command(cmd, fn) { this.commands.set(cmd, fn); }
    action(trigger, fn) { this.actions.set(trigger, fn); }
    on(type, fn) { 
        if (Array.isArray(type)) {
            type.forEach(t => this.onHandlers.push({ type: t, fn }));
        } else {
            this.onHandlers.push({ type, fn }); 
        }
    }
    catch(fn) { this.catchHandler = fn; }

    // --- Gestion des messages entrants ---
    async handleUpdate(channelSource, msg) {
        // Résolution de l'instance du canal
        let channel = channelSource;
        let incomingMsg = msg;

        // Si msg est absent, channelSource est probablement l'objet message direct
        if (!incomingMsg && channelSource && typeof channelSource === 'object') {
            incomingMsg = channelSource;
            const platform = (incomingMsg.ctx?.platform || incomingMsg.platform) || 'telegram';
            channel = this.channels.get(platform);
        } else if (typeof channelSource === 'string') {
            channel = this.channels.get(channelSource);
        }

        // --- NORMALISATION DE L'UPDATE (SUPPORTS TELEGRAF UPDATE OBJ) ---
        if (incomingMsg.callback_query && !incomingMsg.isAction) {
            incomingMsg.isAction = true;
            incomingMsg.text = incomingMsg.callback_query.data;
            if (!incomingMsg.from && incomingMsg.callback_query.from) {
                incomingMsg.from = incomingMsg.callback_query.from.id;
                incomingMsg.name = incomingMsg.callback_query.from.first_name;
                incomingMsg.username = incomingMsg.callback_query.from.username;
            }
        }
        // -------------------------------------------------------------

        if (!channel) {
            waLog(`[ERROR] Canal introuvable pour l'update: ${channelSource}`);
            return;
        }

        const fromRaw = String(incomingMsg.from || incomingMsg.ctx?.from?.id || incomingMsg.callback_query?.from?.id || '');
        const userId = this._normalizeId(fromRaw);
        const isCallback = !!incomingMsg.isAction;

        let settings = { private_mode: false };
        let registeredUser = null;
        let isNew = false;

        try {
            settings = await getAppSettings();
            incomingMsg._settings = settings;

            if (isCallback) {
                const docId = `telegram_${userId}`;
                const db = require('./database');
                let entry = db._userCache?.get(docId);
                registeredUser = entry?.data || null;
                
                if (!registeredUser) {
                    registeredUser = await db.getUser(userId, 'telegram');
                }
            } else {
                const reg = await registerUser({
                    id: userId,
                    first_name: incomingMsg.name || 'Utilisateur Telegram',
                    username: incomingMsg.username || '',
                    type: 'user'
                }, 'telegram');

                registeredUser = reg?.user;
                isNew = !!reg?.isNew;
            }
            incomingMsg.user = registeredUser;
            incomingMsg._isNewUser = isNew;
        } catch (e) {
            console.error(`[Dispatcher] Auto-reg failed: ${e.message}`);
        }

        const ctx = await this._createUnifiedContext(channel, incomingMsg, userId);
        
        try {
            let index = -1;
            const next = async () => {
                index++;
                if (index < this.middleware.length) {
                    await this.middleware[index](ctx, next);
                } else {
                    const user = ctx.state.user;
                    // Mode privé : si activé, on vérifie l'approbation. 
                    // En mode privé strictly false, tout le monde passe.
                    const isApproved = (settings.private_mode === false) || 
                                     (user?.is_approved === true) || 
                                     user?.is_livreur === true || 
                                     (await require('../handlers/admin').isAdmin(ctx));

                    const isStartCommand = ctx.message?.text?.startsWith('/start') || 
                                         ctx.message?.text?.toLowerCase() === 'start';
                    
                    const isPermittedAction = ctx.callbackQuery && [
                        'check_sub', 'refresh_status', 'start'
                    ].some(a => ctx.callbackQuery.data === a || 
                        ctx.callbackQuery.data.startsWith('approve_')); // Permis car l'handler check l'accès de l'admin

                    if (!isApproved && !isStartCommand && !isPermittedAction) {
                        if (ctx.callbackQuery) {
                            return ctx.answerCbQuery("🛑 Votre accès est en attente de validation par l'administrateur.", { show_alert: true }).catch(() => { });
                        }
                        
                        if (this.commands.has('start')) {
                            console.log(`[Dispatcher] Redirection user non-approuvé ${userId} vers /start`);
                            return await this.commands.get('start')(ctx);
                        }
                        return;
                    }

                    if (user && user.is_blocked) {
                        if (ctx.callbackQuery) {
                            return ctx.answerCbQuery("⛔️ Votre compte est suspendu.", { show_alert: true }).catch(() => { });
                        }
                        return ctx.reply("⛔️ <b>ACCÈS REFUSÉ</b>\n\nVotre compte a été suspendu par l'administration. Contactez le support pour plus d'informations.", { parse_mode: 'HTML' }).catch(() => { });
                    }

                    await this._route(ctx);
                }
            };
            await next();
        } catch (err) {
            console.error(`[Dispatcher] Error:`, err);
            if (this.catchHandler) await this.catchHandler(err, ctx);
        }
    }

    _isPrivilegedUser(userId, user, settings) {
        if (user?.is_livreur) return true;
        const cleanId = String(userId).replace('telegram_', '');
        const adminIds = String(settings?.admin_telegram_id || '').match(/\d+/g) || [];
        const envAdmin = String(process.env.ADMIN_TELEGRAM_ID || '').match(/\d+/g)?.[0] || '';
        return adminIds.includes(cleanId) || cleanId === envAdmin;
    }

    async _createUnifiedContext(channel, msg, normalizedFrom) {
        const userId = normalizedFrom;
        const settings = msg._settings || await getAppSettings();
        const _isPrivileged = this._isPrivilegedUser(userId, msg.user, settings);

        const ctx = {
            channel: channel,
            platform: 'telegram',
            from: { id: userId, first_name: msg.name, username: msg.user?.username || msg.username || '', is_bot: false },
            chat: { id: userId, type: 'private' },
            state: { user: msg.user, settings: settings },
            _handled: false,
            _isPrivileged,
            message: { text: msg.text, photo: msg.photo, video: msg.video, message_id: msg.message_id || msg.rawId },
            updateType: msg.type || 'message',
            match: null,
            botInfo: { username: settings.bot_name || 'Bot' },
            callbackQuery: msg.isAction ? { 
                data: msg.text,
                message: msg.ctx?.callbackQuery?.message || null
            } : null,
            telegram: {
                instance: (channel.type === 'telegram' && channel.getBotInstance) ? channel.getBotInstance().telegram : null,
                sendMessage: async (id, text, extra = {}) => {
                    const { sendMessageToUser } = require('./notifications');
                    if (String(id) === String(userId)) return ctx.reply(text, extra);
                    return sendMessageToUser(id, text, extra);
                },
                sendPhoto: async (id, photo, extra = {}) => {
                    const { sendMessageToUser } = require('./notifications');
                    if (String(id) === String(userId)) return ctx.replyWithPhoto(photo, extra);
                    return sendMessageToUser(id, extra.caption || "", { ...extra, media_url: photo, media_type: 'photo' });
                },
                sendVideo: async (id, video, extra = {}) => {
                    const { sendMessageToUser } = require('./notifications');
                    if (String(id) === String(userId)) return ctx.replyWithVideo(video, extra);
                    return sendMessageToUser(id, extra.caption || "", { ...extra, media_url: video, media_type: 'video' });
                },
                editMessageText: async (cid, mid, mid2, text, extra = {}) => {
                    const tgCh = registry.query('telegram');
                    const tgBot = tgCh?.getBotInstance?.();
                    if (tgBot) return tgBot.telegram.editMessageText(cid || userId, mid, mid2, text, { parse_mode: 'HTML', ...extra });
                    return ctx.reply(text, extra);
                },
                editMessageMedia: async (cid, mid, mid2, media, extra = {}) => {
                    const tgCh = registry.query('telegram');
                    const tgBot = tgCh?.getBotInstance?.();
                    if (tgBot) return tgBot.telegram.editMessageMedia(cid || userId, mid, mid2, media, extra);
                    return null;
                },
                deleteMessage: async (cid, mid) => {
                    const tgCh = registry.query('telegram');
                    const tgBot = tgCh?.getBotInstance?.();
                    if (tgBot) return tgBot.telegram.deleteMessage(cid || userId, mid).catch(() => {});
                    return true;
                },
                sendMediaGroup: async (cid, mediaGroup, opts = {}) => {
                    const tgCh = registry.query('telegram');
                    const tgBot = tgCh?.getBotInstance?.();
                    if (tgBot) {
                        if (!_isPrivileged) opts = { ...opts, protect_content: true };
                        return tgBot.telegram.sendMediaGroup(cid || userId, mediaGroup, opts);
                    }
                    return [];
                },
                setChatMenuButton: async (cid, menuButton) => {
                    const tgCh = registry.query('telegram');
                    const tgBot = tgCh?.getBotInstance?.();
                    if (tgBot) return tgBot.telegram.setChatMenuButton(cid || userId, menuButton).catch(() => {});
                    return true;
                },
                getFileLink: async (fileId) => {
                    const tgCh = registry.query('telegram');
                    const tgBot = tgCh?.getBotInstance?.();
                    if (tgBot) return tgBot.telegram.getFileLink(fileId);
                    throw new Error('getFileLink not available');
                }
            },

            reply: async (text, extra = {}) => {
                ctx._handled = true;
                if (!_isPrivileged) extra = { ...extra, protect_content: true };
                
                const options = this._convertExtra(extra);
                
                let res;
                if (options.buttons && options.buttons.length > 0) {
                    res = await channel.sendInteractive(userId, text, options.buttons, options);
                } else {
                    res = await channel.sendMessage(userId, text, options);
                }
                
                const trackId = res?.message_id || res?.messageId;
                if (trackId) addMessageToTrack(userId, trackId).catch(() => {});
                return res;
            },
            replyWithHTML: async (text, extra = {}) => ctx.reply(text, { ...extra, parse_mode: 'HTML' }),
            replyWithPhoto: async (photo, extra = {}) => {
                ctx._handled = true;
                if (!_isPrivileged) extra = { ...extra, protect_content: true };
                const options = this._convertExtra(extra);
                
                let res;
                if (options.buttons && options.buttons.length > 0) {
                    res = await channel.sendInteractive(userId, extra.caption || "", options.buttons, { ...options, media_url: photo, media_type: 'photo' });
                } else {
                    res = await channel.sendMessage(userId, extra.caption || "", { ...options, media_url: photo, media_type: 'photo' });
                }

                const trackId = res?.message_id || res?.messageId;
                if (trackId) addMessageToTrack(userId, trackId).catch(() => {});
                return res;
            },
            replyWithVideo: async (video, extra = {}) => {
                ctx._handled = true;
                if (!_isPrivileged) extra = { ...extra, protect_content: true };
                const options = this._convertExtra(extra);
                
                let res;
                if (options.buttons && options.buttons.length > 0) {
                    res = await channel.sendInteractive(userId, extra.caption || "", options.buttons, { ...options, media_url: video, media_type: 'video' });
                } else {
                    res = await channel.sendMessage(userId, extra.caption || "", { ...options, media_url: video, media_type: 'video' });
                }

                const trackId = res?.message_id || res?.messageId;
                if (trackId) addMessageToTrack(userId, trackId).catch(() => {});
                return res;
            },
            answerCbQuery: async (text) => {
                if (msg.ctx?.answerCbQuery) return msg.ctx.answerCbQuery(text).catch(() => {});
                return true;
            },
            deleteMessage: async (mid) => {
                const targetMid = mid || ctx.message?.message_id;
                if (!targetMid) return false;
                const tgCh = registry.query('telegram');
                const tgBot = tgCh?.getBotInstance?.();
                if (tgBot) return tgBot.telegram.deleteMessage(userId, targetMid).catch(() => {});
                return true;
            },
            editMessageText: async (text, extra = {}) => {
                ctx._handled = true;
                if (ctx.callbackQuery?.message) {
                    const tgCh = registry.query('telegram');
                    const tgBot = tgCh?.getBotInstance?.();
                    if (tgBot) {
                        try {
                            return await tgBot.telegram.editMessageText(userId, ctx.callbackQuery.message.message_id, null, text, { parse_mode: 'HTML', ...extra });
                        } catch (e) {
                            if (!String(e.description || '').includes('not modified')) console.warn('[Dispatcher] editMessageText failed:', e.message);
                        }
                    }
                }
                return ctx.reply(text, extra);
            }
        };

        return ctx;
    }

    _convertExtra(extra) {
        const options = {};
        let buttons = [];

        if (extra.reply_markup) {
            if (extra.reply_markup.inline_keyboard) {
                buttons = extra.reply_markup.inline_keyboard;
            } else if (extra.reply_markup.keyboard) {
                buttons = extra.reply_markup.keyboard.flat();
            }
        } else if (extra.inline_keyboard) {
            buttons = extra.inline_keyboard;
        }

        if (buttons.length > 0) {
            const processedButtons = Array.isArray(buttons[0]) ? buttons.flat() : buttons;
            options.buttons = processedButtons.map(b => ({
                id: b.callback_data || b.id || b.text,
                title: b.text,
                url: b.url,
                web_app: b.web_app
            }));
            // On garde aussi le format Telegram natif pour sendMessage si besoin
            if (extra.reply_markup) options.reply_markup = extra.reply_markup;
        }

        if (extra.parse_mode === 'HTML') options.parse_mode = 'HTML';
        if (extra.video) {
            options.media_url = extra.video;
            options.media_type = 'video';
        } else if (extra.photo) {
            options.media_url = extra.photo;
            options.media_type = 'photo';
        }
        if (extra.caption) options.caption = extra.caption;
        if (extra.protect_content) options.protect_content = true;
        return options;
    }

    async _route(ctx) {
        /* Verification de licence
        const licenseUrl = !!process.env.SUPABASE_URL;
        const licenseKey = !!process.env.RAILWAY_SERVICE_ID; // Simulé
        
        console.log(`[License] Manquant: URL=${licenseUrl}, KEY=${licenseKey}`);
        if (!licenseUrl || !licenseKey) {
            console.log(`❌ Licence invalide.`);
            process.exit(1);
        } */
        const userId = ctx.from.id;
        const msg = ctx.message || {};
        const text = msg.text || ctx.text || '';
        const lowerText = text.toLowerCase().trim();
        
        if (ctx.callbackQuery) {
            const data = ctx.callbackQuery.data;
            const found = await this._routeAction(ctx, data);
            return;
        }

        if (text.startsWith('/')) {
            const cmd = text.split(' ')[0].substring(1);
            if (this.commands.has(cmd)) {
                return await this.commands.get(cmd)(ctx);
            }
        }

        for (const h of this.onHandlers) {
            if (h.type === 'text' && (ctx.message.text || ctx.text)) {
                await h.fn(ctx, () => {});
            } else if (h.type === 'photo' && ctx.message.photo) {
                await h.fn(ctx, () => {});
            } else if (h.type === 'video' && ctx.message.video) {
                await h.fn(ctx, () => {});
            } else if (h.type === 'message') {
                await h.fn(ctx, () => {});
            } else if (h.type === 'location' && ctx.message.location) {
                await h.fn(ctx, () => {});
            }
            if (ctx._handled) break;
        }

        if (ctx._handled) return;

        // Nettoyage Emojis pour les boutons du Reply Keyboard (Style La Frappe)
        const cleanText = lowerText.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

        if (['menu', 'hi', 'bonjour', 'salut', 'hello', 'hey', 'yo', 'coucou', 'start', 'boutique', 'catalogue', 'commander', 'commande', 'aide', 'help', 
             'panier', 'réglages', 'reglages', 'commandes', 'historique', 'profile', 'parrain', 'livreur', 'fournisseur', 'admin'].includes(cleanText) || 
            ['menu', 'hi', 'bonjour', 'salut', 'hello', 'hey', 'yo', 'coucou', 'start', 'boutique', 'catalogue', 'commander', 'commande', 'aide', 'help', 
             'panier', 'réglages', 'reglages', 'commandes', 'historique', 'profile', 'parrain', 'livreur', 'fournisseur', 'admin'].includes(lowerText)) {
            
            if (this.commands.has('start')) return await this.commands.get('start')(ctx);
        }
    }

    async _routeAction(ctx, data) {
        for (const [trigger, fn] of this.actions.entries()) {
            if (typeof trigger === 'string' && data === trigger) {
                try {
                    await fn(ctx);
                } catch(e) {
                    waLog(`[ROUTE-ERROR] Handler "${data}" a planté: ${e.message}`);
                }
                return true;
            } else if (trigger instanceof RegExp) {
                const match = data.match(trigger);
                if (match) {
                    ctx.match = match;
                    try {
                        await fn(ctx);
                    } catch(e) {
                        waLog(`[ROUTE-ERROR] Handler regex "${trigger}" a planté: ${e.message}`);
                    }
                    return true;
                }
            }
        }
        return false;
    }
}

module.exports = Dispatcher;
