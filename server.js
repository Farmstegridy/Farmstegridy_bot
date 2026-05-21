const express = require('express');
const cors = require('cors');
const path = require('path');
const fileUpload = require('express-fileupload');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const {
    getUserCount, getActiveUserCount, getRecentUsers, searchUsers,
    getReferralLeaderboard, getStatsOverview, getDailyStats,
    getProducts, saveProduct, deleteProduct,
    getAllOrders, updateOrderStatus, setLivreurStatus, getOrder, assignOrderLivreur,
    setLivreurAvailability, getAppSettings, updateAppSettings,
    deleteUser, incrementOrderCount, makeDocId, getOrderAnalytics, searchLivreurs,
    getBroadcastHistory, saveBroadcast, deleteBroadcast, getDetailedLivreurActivity,
    nukeDatabase, decryptUser, uploadMediaBuffer, supabase, COL_USERS,
    registerUser, getLivreurHistory, getReviews, deleteReview, deleteOrder,
    getSuppliers, getSupplier, saveSupplier, deleteSupplier, getSupplierProducts, getSupplierOrders,
    setAdminStatus, setModeratorStatus,
    // Marketplace
    getMarketplaceProducts, getMarketplaceProduct, getAvailableMarketplaceProducts,
    saveMarketplaceProduct, deleteMarketplaceProduct, updateMarketplaceStock,
    createMarketplaceOrder, getMarketplaceOrders, getMarketplaceOrder, updateMarketplaceOrderStatus
} = require('./services/database');
const { broadcastMessage } = require('./services/broadcast');
const fs = require('fs');

function debugLog(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(path.join(process.cwd(), 'debug_shop.log'), line);
    } catch (e) { }
    console.log(msg);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

// configuration handled in index.js

const { dispatcher } = require('./services/dispatcher');
const { registry } = require('./channels/ChannelRegistry');

// Référence partagée au bot Telegram (définie par index.js)
let _bot = null;
function setBotInstance(bot) { _bot = bot; }
function getBotInstance() { return _bot; }

const JWT_SECRET = process.env.ENCRYPTION_KEY || process.env.SUPABASE_KEY || process.env.BOT_TOKEN || require('crypto').randomBytes(64).toString('hex');
const authLogs = [];


// Rate limiter : 5 tentatives max par 15 minutes sur le login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Gestion IPv6 : normaliser l'IP pour éviter le bypass
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        // Supprimer le préfixe ::ffff: pour normaliser IPv4-mapped IPv6
        return ip.replace(/^::ffff:/, '');
    },
    validate: { xForwardedForHeader: false, default: true, keyGeneratorIpFallback: false },
    handler: (req, res, next, options) => {
        console.warn(`[AUTH] Rate limit atteint pour IP: ${req.ip}`);
        res.status(429).json(options.message);
    }
});

function createServer(port = 8080) {
    const app = express();

    // Log all requests for debugging
    app.use((req, res, next) => {
        console.log(`[HTTP] ${req.method} ${req.url} (from ${req.ip})`);
        next();
    });

    console.log(`[System] Initializing server on port: ${port}`);

    app.use(cors());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    app.use(fileUpload({
        limits: { fileSize: 500 * 1024 * 1024 },
        useTempFiles: true,
        tempFileDir: '/tmp/'
    }));
    app.use('/public', express.static(path.join(__dirname, 'web', 'public')));


    // ========== Authentication ==========

    async function authMiddleware(req, res, next) {
        const raw = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
        if (!raw) return res.status(401).json({ error: 'Token manquant' });

        // 1. Essai JWT signé
        try {
            jwt.verify(raw, JWT_SECRET);
            return next();
        } catch (_) {}

        // 2. Rétrocompatibilité : token = mot de passe en clair (ancien comportement)
        // Conservé uniquement pour la migration — supprimé après déploiement stable
        try {
            const settings = await getAppSettings();
            if (raw === settings.admin_password || raw === ADMIN_PASSWORD) {
                return next();
            }
        } catch (_) {}

        console.warn(`[AUTH] Accès refusé — token invalide (IP: ${req.ip})`);
        res.status(401).json({ error: 'Non autorisé' });
    }

    // Health check pour Railway/Debug
    app.get('/_health', (req, res) => {
        res.json({
            status: 'ok',
            time: new Date().toISOString(),
            branding: 'FARMSTEGRIDY BOT',
            port: process.env.PORT || 'not-set',
            env: process.env.RAILWAY_ENVIRONMENT || 'local',
            proxies: {
                http: process.env.http_proxy || process.env.HTTP_PROXY || 'not-set',
                https: process.env.https_proxy || process.env.HTTPS_PROXY || 'not-set',
                all: process.env.ALL_PROXY || process.env.all_proxy || 'not-set'
            }
        });
    });



    // ========== Static Pages ==========

    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'web', 'views', 'login.html')));
    app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'web', 'views', 'login.html')));
    app.get('/favicon.ico', (req, res) => res.status(204).end());
    app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'web', 'views', 'dashboard.html')));
    app.get('/address-picker', (req, res) => res.sendFile(path.join(__dirname, 'web', 'views', 'address_picker.html')));
    app.get('/catalog', (req, res) => res.sendFile(path.join(__dirname, 'web', 'views', 'catalog.html')));
    app.get('/livreur', (req, res) => res.sendFile(path.join(__dirname, 'web', 'views', 'livreur.html')));


    // ========== API Routes ==========

    app.post('/api/login', loginLimiter, async (req, res) => {
        try {
            const { password } = req.body;
            let settings = {};
            try {
                settings = await getAppSettings();
            } catch (e) {
                console.error('⚠️ getAppSettings() a échoué, fallback sur ADMIN_PASSWORD:', e.message);
            }

            if (password === settings.admin_password || password === ADMIN_PASSWORD) {
                // Émet un JWT signé valable 12h — le mot de passe ne transite plus dans les requêtes
                const token = jwt.sign(
                    { role: 'admin', iat: Math.floor(Date.now() / 1000) },
                    JWT_SECRET,
                    { expiresIn: '12h' }
                );
                console.log(`[AUTH] Login admin réussi (IP: ${req.ip})`);
                res.json({ success: true, token });
            } else {
                console.warn(`[AUTH] Échec login (IP: ${req.ip})`);
                res.status(401).json({ error: 'Mot de passe incorrect' });
            }
        } catch (e) {
            console.error('❌ Erreur login:', e.message);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    function verifyTelegramWebAppData(initData, botToken) {
        if (!initData || !botToken) return false;
        try {
            const crypto = require('crypto');
            let cleanToken = botToken.trim();
            if (cleanToken.startsWith('=')) {
                cleanToken = cleanToken.substring(1).trim();
            }

            const params = new URLSearchParams(initData);
            const hash = params.get('hash');
            if (!hash) return false;

            params.delete('hash');

            const keys = Array.from(params.keys()).sort();
            const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(cleanToken).digest();
            const signature = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

            return signature === hash;
        } catch (e) {
            console.error('[AUTH-TG] Error validating Telegram WebApp initData:', e);
            return false;
        }
    }

    app.get('/api/debug-auth-logs', (req, res) => {
        res.json(authLogs);
    });

    app.post('/api/login-telegram', async (req, res) => {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ip: req.ip || req.socket?.remoteAddress,
            initDataTruncated: req.body.initData ? (req.body.initData.substring(0, 100) + '...') : null,
            initDataFullLength: req.body.initData ? req.body.initData.length : 0,
            hasInitData: !!req.body.initData,
            isValid: false
        };
        authLogs.push(logEntry);
        if (authLogs.length > 50) authLogs.shift();

        try {
            const { initData } = req.body;
            if (!initData) {
                logEntry.error = 'initData manquant';
                return res.status(400).json({ error: 'initData manquant' });
            }

            let token = process.env.BOT_TOKEN;
            const settings = await getAppSettings().catch((err) => {
                logEntry.getSettingsError = err.message;
                return {};
            });
            if (settings && settings.telegram_token) {
                token = settings.telegram_token;
            }
            logEntry.tokenUsed = token ? (token.substring(0, 10) + '...') : null;

            if (!token) {
                logEntry.error = 'Bot token introuvable';
                console.error('[AUTH-TG] Bot token introuvable');
                return res.status(500).json({ error: 'Configuration serveur incomplète' });
            }

            const isValid = verifyTelegramWebAppData(initData, token);
            logEntry.isValid = isValid;
            if (!isValid) {
                logEntry.error = 'Signature initData invalide';
                console.warn('[AUTH-TG] Signature initData invalide');
                return res.status(401).json({ error: 'Signature invalide' });
            }

            const params = new URLSearchParams(initData);
            const userStr = params.get('user');
            logEntry.hasUserStr = !!userStr;
            if (!userStr) {
                logEntry.error = 'Utilisateur non spécifié dans initData';
                return res.status(400).json({ error: 'Utilisateur non spécifié' });
            }

            const tgUser = JSON.parse(userStr);
            logEntry.tgUser = tgUser;
            const userId = `telegram_${tgUser.id}`;
            logEntry.userId = userId;

            const { getUser } = require('./services/database');
            const user = await getUser(userId).catch(err => {
                logEntry.getUserError = err.message;
                return null;
            });
            logEntry.foundUser = !!user;
            if (user) {
                logEntry.userIsAdmin = !!user.is_admin;
                logEntry.userFirstName = user.first_name;
            }

            if (!user || !user.is_admin) {
                logEntry.error = `Accès refusé pour ${userId} (non-admin)`;
                console.warn(`[AUTH-TG] Accès refusé pour ${userId} (non-admin)`);
                return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
            }

            // Générer le jeton JWT admin
            const jwtToken = jwt.sign(
                { role: 'admin', userId: userId, iat: Math.floor(Date.now() / 1000) },
                JWT_SECRET,
                { expiresIn: '12h' }
            );

            logEntry.success = true;
            console.log(`[AUTH-TG] Connexion automatique admin réussie pour ${user.first_name || ''} (${userId})`);
            return res.json({ success: true, token: jwtToken });
        } catch (e) {
            logEntry.error = e.message;
            console.error('❌ Erreur auto-login Telegram:', e);
            return res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    app.post('/api/forgot-password', async (req, res) => {
        try {
            const settings = await getAppSettings();
            const bot = getBotInstance();
            if (!bot) return res.status(500).json({ error: 'Bot non initialisé' });

            const adminIds = String(settings.admin_telegram_id || '').split(/[\s,]+/).map(id => id.trim().replace('telegram_', ''));
            const alertMsg = `⚠️ <b>RÉCUPÉRATION DE COMPTE</b>\n\nUne demande de réinitialisation du mot de passe a été faite depuis le Dashboard.\n\nSouhaitez-vous modifier le mot de passe d'administration ?`;
            const keyboard = {
                inline_keyboard: [[{ text: '🔄 Modifier le mot de passe', callback_data: 'admin_trigger_password_reset' }]]
            };

            for (const adminId of adminIds) {
                if (adminId) bot.telegram.sendMessage(adminId, alertMsg, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => { });
            }

            res.json({ success: true, message: 'Notification envoyée aux administrateurs.' });
        } catch (e) {
            console.error('Forgot password error:', e.message);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    app.get('/api/stats', authMiddleware, async (req, res) => {
        try { res.json(await getStatsOverview()); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/stats/daily', authMiddleware, async (req, res) => {
        try { res.json(await getDailyStats(parseInt(req.query.days) || 30)); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/users', authMiddleware, async (req, res) => {
        try { res.json(await getRecentUsers(parseInt(req.query.limit) || 200)); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/users/blocked', authMiddleware, async (req, res) => {
        try {
            const { getBlockedUsers } = require('./services/database');
            res.json(await getBlockedUsers(parseInt(req.query.limit) || 100));
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/users/pending', authMiddleware, async (req, res) => {
        try {
            const { getPendingUsers } = require('./services/database');
            res.json(await getPendingUsers());
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/users/search', authMiddleware, async (req, res) => {
        try { res.json(await searchUsers(req.query.q, req.query.tab || 'active')); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/users/delete', authMiddleware, async (req, res) => {
        try {
            await deleteUser(req.body.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/users/add', authMiddleware, async (req, res) => {
        try {
            const { telegram_id, first_name, username } = req.body;

            // Nettoyage de l'ID (on enlève le préfixe si l'admin l'a mis par erreur)
            const cleanId = String(telegram_id || '').replace('telegram_', '').trim();
            if (!cleanId) return res.status(400).json({ error: 'ID Telegram manquant ou invalide' });

            const { user, isNew } = await registerUser({
                id: cleanId,
                first_name: first_name || 'Utilisateur Manuel',
                username: username || '',
                type: 'user'
            });

            res.json({ success: true, user, isNew });
        } catch (e) {
            console.error('Add user error:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/users/block', authMiddleware, async (req, res) => {
        try {
            const { markUserBlocked } = require('./services/database');
            await markUserBlocked(req.body.id, true);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/users/check-status', authMiddleware, async (req, res) => {
        try {
            const { getUser, markUserBlocked, markUserUnblocked } = require('./services/database');
            const u = await getUser(req.body.id);
            if (!u || !u.platform_id) return res.json({ success: false, error: 'User introuvable' });

            try {
                const bot = getBotInstance();
                if (!bot) return res.status(500).json({ error: 'Bot non initialisé' });

                // On tente une petite action "typing" pour voir si le bot est bloqué
                const chatId = u.platform_id.replace('telegram_', '');
                await bot.telegram.sendChatAction(chatId, 'typing');

                // Si ça réussit et qu'il était marqué bloqué par le client, on le débloque
                if (u.is_blocked && u.data && u.data.blocked_by_admin === false) {
                    await markUserUnblocked(u.id);
                }
                res.json({ success: true, status: 'active' });
            } catch (err) {
                const desc = err.description || '';
                if (err.code === 403 || desc.includes('blocked') || desc.includes('chat not found')) {
                    await markUserBlocked(u.id, false);
                    return res.json({ success: true, status: 'blocked' });
                }
                throw err;
            }
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/users/approve', authMiddleware, async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ error: 'User ID manquant' });
            
            const { approveUser } = require('./services/database');
            await approveUser(userId);
            
            res.json({ success: true, message: 'Accès accordé avec succès' });
        } catch (e) {
            console.error('API Approve Error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/users/unblock', authMiddleware, async (req, res) => {
        try {
            const { markUserUnblocked } = require('./services/database');
            await markUserUnblocked(req.body.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/users/order', authMiddleware, async (req, res) => {
        try {
            await incrementOrderCount(req.body.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    // ========== Product Routes ==========

    app.get('/api/products', async (req, res) => {
        try { res.json(await getProducts()); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/inventory/ledger', authMiddleware, async (req, res) => {
        try {
            const { data, error } = await supabase
                .from('bot_stock_ledger')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            res.json(data || []);
        } catch (e) {
            console.error('[API] Error fetching stock ledger:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    let lastCatalogNotificationTime = 0;
    const CATALOG_NOTIFICATION_COOLDOWN = 10 * 60 * 1000; // 10 minutes
    app.post('/api/products', authMiddleware, async (req, res) => {
        try {
            const isMp = req.body.is_mp === true;
            delete req.body.is_mp; // IMPORTANT: Ne pas envoyer en DB native/MP

            const isNew = !req.body.id;
            let id;
            let oldProduct = null;
            if (req.body.id && !isMp) {
                const { getProduct } = require('./services/database');
                oldProduct = await getProduct(req.body.id).catch(() => null);
            }

            if (isMp) {
                const { saveMarketplaceProduct } = require('./services/database');
                id = await saveMarketplaceProduct(req.body);
            } else {
                id = await saveProduct(req.body);
            }

            // Log stock movement for native products
            if (!isMp) {
                const { logStockMovement } = require('./services/inventory_manager');
                if (isNew) {
                    if (req.body.stock !== undefined) {
                        const newStock = parseInt(req.body.stock) || 0;
                        await logStockMovement(id, newStock, 'replenishment', 'admin_creation');
                    }
                } else if (oldProduct && req.body.stock !== undefined) {
                    const oldStock = parseInt(oldProduct.stock) || 0;
                    const newStock = parseInt(req.body.stock) || 0;
                    const diff = newStock - oldStock;
                    if (diff !== 0) {
                        const reason = diff > 0 ? 'replenishment' : 'manual_adjustment';
                        await logStockMovement(id, diff, reason, 'admin_update');
                    }
                }
            }

            // Notification automatique si nouveau produit
            if (isNew) {
                const now = Date.now();
                if (now - lastCatalogNotificationTime > CATALOG_NOTIFICATION_COOLDOWN) {
                    const settings = await getAppSettings();
                    const cleanName = escapeHTML(req.body.name);
                    const msg = (settings?.msg_auto_timer || '🔥 <b>Le catalogue est à jour !</b>') + (cleanName ? `\n\n<b>Nouveauté :</b> ${cleanName}` : '');
                    
                    // Extraction des médias pour la notification
                    let mediaUrls = [];
                    if (req.body.image_url) {
                        try {
                            const parsed = JSON.parse(req.body.image_url);
                            if (Array.isArray(parsed)) {
                                mediaUrls = parsed.map(m => typeof m === 'string' ? { url: m, type: 'photo' } : m);
                            } else {
                                mediaUrls = [typeof parsed === 'string' ? { url: parsed, type: 'photo' } : parsed];
                            }
                        } catch (e) {
                            mediaUrls = [{ url: req.body.image_url, type: 'photo' }];
                        }
                    }

                    // On broadcast à tous les utilisateurs avec les médias du produit
                    broadcastMessage('users', msg, { mediaUrls: mediaUrls.slice(0, 1) }).catch(err => {
                        console.error('[Auto-Notif] Broadcast failed:', err.message);
                    });
                    
                    lastCatalogNotificationTime = now;
                    console.log(`[Auto-Notif] Notification "Catalogue à jour" (avec média) envoyée car nouveau produit #${id} ajouté.`);
                } else {
                    console.log(`[Auto-Notif] Notification ignorée (cooldown actif).`);
                }
            }

            res.json({ success: true, id });
        } catch (e) {
            console.error('Product save error:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/products/:id', authMiddleware, async (req, res) => {
        try {
            await deleteProduct(req.params.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    // ========== Order Routes ==========

    app.get('/api/orders', authMiddleware, async (req, res) => {
        try { res.json(await getAllOrders(parseInt(req.query.limit) || 100)); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/orders/search', authMiddleware, async (req, res) => {
        try { 
            const { searchOrders } = require('./services/database');
            res.json(await searchOrders(req.query.q)); 
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.delete('/api/orders/:id', authMiddleware, async (req, res) => {
        try {
            const { deleteOrder } = require('./services/database');
            await deleteOrder(req.params.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/analytics', authMiddleware, async (req, res) => {
        try { res.json(await getOrderAnalytics()); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/analytics/backfill-cities', authMiddleware, async (req, res) => {
        try {
            const { backfillOrderCities } = require('./services/database');
            const result = await backfillOrderCities();
            res.json({ success: true, ...result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ========== Upload Routes ==========
    app.post('/api/upload', authMiddleware, async (req, res) => {
        try {
            if (!req.files || !req.files.file) {
                console.log('[UPLOAD] req.files:', req.files ? Object.keys(req.files) : 'null');
                return res.status(400).json({ error: 'Aucun fichier téléchargé' });
            }

            const file = req.files.file;
            let ext = path.extname(file.name).toLowerCase();
            let mimetype = file.mimetype;
            
            // Normalisation pour Supabase / Web / iOS (.mov support)
            if (mimetype === 'video/quicktime' || ext === '.mov') {
                mimetype = 'video/mp4';
                ext = '.mp4';
            }

            if (!ext) {
                if (mimetype.includes('video')) ext = '.mp4';
                else if (mimetype.includes('image')) ext = '.jpg';
                else ext = '.bin';
            }
            
            const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;

            console.log(`[UPLOAD] Fichier reçu: ${file.name} (mime=${file.mimetype}, size=${file.size}, dataLen=${file.data?.length || 0}, tempFile=${file.tempFilePath || 'none'})`);

            // Upload direct vers Supabase Storage (seule source de vérité — pas de fallback local)
            const { supabase } = require('./config/supabase');

            // Avec useTempFiles: true, file.data est un Buffer vide — on DOIT lire le tempFile
            let fileBuf = null;

            // Priorité 1 : lire depuis le fichier temporaire (plus fiable avec useTempFiles)
            if (file.tempFilePath) {
                try {
                    fileBuf = fs.readFileSync(file.tempFilePath);
                    console.log(`[UPLOAD] Lu depuis tempFile: ${file.tempFilePath} (${fileBuf.length} bytes)`);
                } catch (readErr) {
                    console.error(`[UPLOAD] Erreur lecture tempFile: ${readErr.message}`);
                }
            }

            // Priorité 2 : utiliser file.data si le tempFile n'a rien donné
            if ((!fileBuf || fileBuf.length === 0) && file.data && file.data.length > 0) {
                fileBuf = file.data;
                console.log(`[UPLOAD] Utilisation file.data: ${fileBuf.length} bytes`);
            }

            // Priorité 3 : si file.mv existe, utiliser pour copier puis lire
            if ((!fileBuf || fileBuf.length === 0) && typeof file.mv === 'function') {
                const tmpPath = `/tmp/upload_fallback_${Date.now()}${ext}`;
                try {
                    await file.mv(tmpPath);
                    fileBuf = fs.readFileSync(tmpPath);
                    fs.unlinkSync(tmpPath);
                    console.log(`[UPLOAD] Lu via file.mv fallback: ${fileBuf.length} bytes`);
                } catch (mvErr) {
                    console.error(`[UPLOAD] Erreur mv fallback: ${mvErr.message}`);
                }
            }

            if (!fileBuf || fileBuf.length === 0) {
                console.error(`[UPLOAD-FAIL] Buffer vide pour ${file.name} (size=${file.size})`);
                return res.status(400).json({ error: 'Fichier vide — upload impossible' });
            }

            const { error } = await supabase.storage
                .from('bot_media')
                .upload(fileName, fileBuf, {
                    contentType: mimetype,
                    upsert: true
                });

            if (error) {
                console.error(`[UPLOAD-FAIL] Supabase Storage: ${error.message}`);
                return res.status(500).json({ error: `Upload échoué: ${error.message}` });
            }

            const { data: publicData } = supabase.storage.from('bot_media').getPublicUrl(fileName);
            const finalUrl = publicData.publicUrl;
            console.log(`[UPLOAD-OK] ${finalUrl} (${fileBuf.length} bytes)`);

            // Nettoyage du fichier temp
            if (file.tempFilePath) {
                fs.unlink(file.tempFilePath, () => {});
            }

            res.json({ success: true, url: finalUrl });
        } catch (e) {
            console.error(`[UPLOAD-FATAL] ${e.message}\n${e.stack}`);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/debug/dir', authMiddleware, async (req, res) => {
        try {
            const dir = path.resolve(__dirname, 'web', 'public', 'uploads');
            if (!fs.existsSync(dir)) return res.send('Répertoire inexistant.');
            const files = fs.readdirSync(dir);
            res.json({ dir, files });
        } catch (e) { res.status(500).send(e.message); }
    });

    app.get('/api/debug/logs', authMiddleware, async (req, res) => {
        try {
            const logPath = path.join(process.cwd(), 'debug_shop.log');
            const replicaIndex = process.env.RAILWAY_REPLICA_INDEX || '0';
            if (!fs.existsSync(logPath)) return res.send(`Aucun log trouvé sur la Replica ${replicaIndex}. (CWD: ${process.cwd()})`);
            
            // Read last 2000 lines for better debugging
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n');
            const lastLines = lines.slice(-2000).join('\n');
            
            res.header('Content-Type', 'text/plain');
            res.send(lastLines);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.get('/api/debug/buckets', authMiddleware, async (req, res) => {
        try {
            const { data, error } = await supabase.storage.listBuckets();
            if (error) return res.status(500).json({ error: error.message });
            res.json(data);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/api/users/approve', authMiddleware, async (req, res) => {
        try {
            const { userId } = req.body;
            const { approveUser } = require('./services/database');
            await approveUser(userId);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/users/role', authMiddleware, async (req, res) => {
        const { docId, role, status } = req.body;
        try {
            const { setAdminStatus, setModeratorStatus, getUser } = require('./services/database');
            const { clearAuthCache } = require('./handlers/admin');

            if (role === 'admin') {
                await setAdminStatus(docId, status);
                const user = await getUser(docId);
                if (user && user.platform_id) {
                    clearAuthCache(user.platform_id);
                }
            }
            else if (role === 'moderator') {
                await setModeratorStatus(docId, status);
                const user = await getUser(docId);
                if (user && user.platform_id) {
                    clearAuthCache(user.platform_id);
                }
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/users/wallet', authMiddleware, async (req, res) => {
        const { userId, amount } = req.body;
        try {
            const { updateUserWallet } = require('./services/database');
            await updateUserWallet(userId, amount);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/users/points', authMiddleware, async (req, res) => {
        const { userId, points } = req.body;
        try {
            const { updateUserPoints } = require('./services/database');
            await updateUserPoints(userId, points);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/livreurs/status', authMiddleware, async (req, res) => {
        const { userId, platform, isLivreur } = req.body;
        try {
            await setLivreurStatus(userId, platform, isLivreur);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/livreurs/search', authMiddleware, async (req, res) => {
        try { res.json(await searchLivreurs(req.query.q)); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/livreurs/availability', authMiddleware, async (req, res) => {
        const { platform, userId, isAvailable, id: directId } = req.body;
        try {
            const docId = directId || makeDocId(platform, userId);
            await setLivreurAvailability(docId, isAvailable);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/admin/nuke', authMiddleware, async (req, res) => {
        try {
            debugLog(`[ADMIN] NUKE DATABASE REQUESTED BY ${req.user?.platform_id || 'unidentified'}`);
            await nukeDatabase();
            res.json({ success: true, message: 'Base de données réinitialisée.' });
        } catch (e) {
            debugLog(`[ADMIN-FATAL] Nuke failed: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/users/profile', authMiddleware, async (req, res) => {
        const { userId, first_name, phone } = req.body;
        try {
            let updates = { updated_at: ts() };
            if (first_name !== undefined) updates.first_name = encryption.encrypt(first_name);
            if (phone !== undefined) updates.phone = phone;
            
            const { error } = await supabase.from(COL_USERS).update(updates).eq('id', userId);
            if (error) throw error;
            
            _userCache.delete(userId);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/livreurs', authMiddleware, async (req, res) => {
        try {
            const { data } = await supabase.from(COL_USERS).select('*').eq('is_livreur', true);
            const livreurs = (data || []).map(d => {
                try { return decryptUser({ ...d, doc_id: d.id }); }
                catch (e) {
                    console.error('Decryption failed for livreur:', d.id, e.message);
                    return { ...d, doc_id: d.id };
                }
            });
            res.json(livreurs);
        } catch (e) { console.error('Livreurs API error:', e); res.status(500).json({ error: e.message }); }
    });

    app.get('/api/livreurs/:id/history', authMiddleware, async (req, res) => {
        try {
            const history = await getDetailedLivreurActivity(req.params.id);
            res.json(history);
        } catch (e) {
            console.error('Livreur history error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/settings', authMiddleware, async (req, res) => {
        try { res.json(await getAppSettings()); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/settings', authMiddleware, async (req, res) => {
        try {
            const updates = { ...req.body };
            if (!updates.admin_password || updates.admin_password.trim() === '') {
                delete updates.admin_password;
            }
            await updateAppSettings(updates);

            // Immediate Telegram API update for bot descriptions
            if (updates.bot_description || updates.bot_short_description) {
                const bot = getBotInstance();
                if (bot) {
                    if (updates.bot_description) {
                        bot.telegram.setMyDescription(updates.bot_description).catch(e => console.error('TG Desc update error:', e.message));
                    }
                    if (updates.bot_short_description) {
                        bot.telegram.setMyShortDescription(updates.bot_short_description).catch(e => console.error('TG Short Desc update error:', e.message));
                    }
                }
            }
            res.json({ success: true });
        } catch (e) {
            console.error('❌ Settings update error:', e);
            res.status(500).json({ error: e.message || 'Erreur serveur' });
        }
    });

    app.post('/api/orders/status', authMiddleware, async (req, res) => {
        try {
            const { orderId, status } = req.body;
            const order = await getOrder(orderId);
            if (!order) return res.status(404).json({ error: 'Commande non trouvée' });

            await updateOrderStatus(orderId, status);

            // Notification Client Automatisée
            if (order.user_id) {
                const { sendMessageToUser } = require('./services/notifications');
                const settings = await getAppSettings();
                const shortId = orderId.slice(-5);
                
                const statusLabel = (status === 'delivered' ? settings.status_delivered_label :
                    (status === 'pending' ? settings.status_pending_label :
                        (status === 'taken' ? settings.status_taken_label : settings.status_cancelled_label))) || status.toUpperCase();

                const statusIcon = (status === 'delivered' ? settings.ui_icon_success :
                    (status === 'pending' ? settings.ui_icon_pending :
                        (status === 'taken' ? (settings.ui_icon_taken || '🚚') : settings.ui_icon_error))) || '🔔';

                let text = '';
                switch (status) {
                    case 'validated':
                        text = `✅ <b>COMMANDE VALIDÉE !</b>\n\nVotre commande #${shortId} a été acceptée. Un livreur va être assigné.`;
                        break;
                    case 'refused':
                    case 'cancelled':
                        text = `${settings.ui_icon_error} <b>COMMANDE ${statusLabel}</b>\n\nVotre commande #${shortId} a été annulée.`;
                        break;
                    case 'delivering':
                    case 'taken':
                        text = `${statusIcon} <b>COMMANDE EN ROUTE !</b>\n\nVotre commande #${shortId} est en cours de livraison. Un livreur a pris en charge votre commande et arrive vers vous. 💨`;
                        break;
                    case 'delivered':
                        text = `${statusIcon} <b>COMMANDE LIVRÉE !</b>\n\nVotre commande #${shortId} a été livrée. Bonne dégustation ! 🏁`;
                        break;
                    case 'arrival_1h':
                        text = `🚚 <b>Commande #${shortId}</b>\n\nVotre livreur arrive dans <b>moins d'une heure</b>. 📦`;
                        break;
                    case 'arrival_30min':
                        text = `⏳ <b>Commande #${shortId}</b>\n\nVotre livreur arrive dans <b>30 min</b> ! Soyez prêt(e). 🛵`;
                        break;
                    case 'arrival_10min':
                        text = `⏳ <b>Commande #${shortId}</b>\n\nVotre livreur arrive dans <b>10 min</b> ! Préparez-vous. 🛵`;
                        break;
                    case 'arrival_5min':
                        text = `⚡ <b>Commande #${shortId}</b>\n\nVotre livreur arrive dans <b>5 min</b> ! Soyez prêt(e). 🔥`;
                        break;
                    case 'arrived':
                        text = `📍 <b>Commande #${shortId}</b>\n\n<b>Votre livreur est arrivé !</b> Il vous attend sur place. ✅`;
                        break;
                    case 'pending':
                        text = `${settings.ui_icon_pending} <b>Mise à jour de commande</b>\n\nVotre commande #${shortId} est de nouveau ${statusLabel}.`;
                        break;
                }
                
                if (text) {
                    const { Markup } = require('telegraf');
                    let keyboard = [];

                    // Ajouter bouton annulation si pas encore livré ou annulé
                    if (!['delivered', 'cancelled', 'refused'].includes(status)) {
                        keyboard.push([Markup.button.callback('❌ Annuler ma commande', `cancel_order_client_${orderId}`)]);
                        // Si c'est en livraison, arrivé ou notification de temps, permettre de répondre
                        if (status.startsWith('arrival_') || status === 'arrived' || status === 'taken' || status === 'delivering') {
                            keyboard.push([Markup.button.callback('💬 Répondre au livreur', `chat_livreur_${orderId}`)]);
                        }
                    } else if (status === 'delivered') {
                        keyboard.push([Markup.button.callback('⭐️ Laisser un avis', `feedback_start_${orderId}`)]);
                    }

                    keyboard.push([Markup.button.callback('◀️ Retour Menu', 'main_menu')]);

                    await sendMessageToUser(order.user_id, text, {
                        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
                    }).catch(() => {});
                }
            }

            res.json({ success: true });
        } catch (e) {
            console.error('Order Status API error:', e);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    app.post('/api/orders/assign', authMiddleware, async (req, res) => {
        try {
            const { orderId, livreurId, livreurName } = req.body;
            const { assignOrderLivreur, getOrder } = require('./services/database');
            await assignOrderLivreur(orderId, livreurId, livreurName);

            // Fetch order to get user/address data for notifications
            const order = await getOrder(orderId);

            // Notifier le livreur si assigné
            if (order && livreurId) {
                const { sendMessageToUser } = require('./services/notifications');
                const textLivreur = `📦 <b>MISSION ASSIGNÉE</b>\n\nUne commande vient de vous être assignée par l'administration.\n\n🆔 #<code>${orderId.slice(-5)}</code>\n👤 Client : ${order.first_name || 'Utilisateur'}\n📍 Adresse : ${order.address || 'Non spécifiée'}`;
                await sendMessageToUser(livreurId, textLivreur, {
                    reply_markup: {
                        inline_keyboard: [[{ text: '📂 Voir la mission', callback_data: `view_active_${orderId}` }]]
                    }
                }).catch(() => { });
            }
            res.json({ success: true });
        } catch (e) {
            console.error('Order Assign API error:', e);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });


    app.post('/api/orders/delete', authMiddleware, async (req, res) => {
        try {
            await deleteOrder(req.body.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    /**
     * Broadcast - accepte FormData avec fichiers médias
     */
    app.post('/api/broadcast', authMiddleware, async (req, res) => {
        try {
            const message = req.body.message || '';
            const platform = req.body.platform || 'all';
            const mediaCount = parseInt(req.body.media_count) || 0;

            // Extraire les fichiers médias
            const mediaFiles = [];
            if (req.files) {
                const fs = require('fs');
                debugLog(`[API-BC] Reçu de ${mediaCount} fichiers attendus.`);
                for (let i = 0; i < mediaCount; i++) {
                    const f = req.files[`media_${i}`];
                    if (f) {
                        try {
                            const fileData = f.tempFilePath ? fs.readFileSync(f.tempFilePath) : f.data;
                            if (fileData && fileData.length > 0) {
                                mediaFiles.push({ data: fileData, mimetype: f.mimetype, name: f.name });
                                debugLog(`[API-BC] Fichier ${i} prêt: ${f.name} (${f.mimetype}, ${fileData.length} octets)`);
                            }
                        } catch (err) {
                            debugLog(`[API-BC-ERR] Lecture fichier ${i}: ${err.message}`);
                        }
                    } else {
                        debugLog(`[API-BC-WARN] media_${i} manquant dans req.files`);
                    }
                }
            }

            let mediaUrls = [];
            try { mediaUrls = req.body.media_urls ? JSON.parse(req.body.media_urls) : []; } catch (e) { mediaUrls = []; }

            // 1. Upload des fichiers physiques reçus en Storage avant mise en file d'attente
            const uploadedUrls = [];
            const { uploadMediaBuffer } = require('./services/database');
            for (let i = 0; i < mediaFiles.length; i++) {
                const f = mediaFiles[i];
                const cleanName = `bc_${Date.now()}_${i}_${f.name.replace(/[^\w.-]/g, '_')}`;
                const url = await uploadMediaBuffer(f.data, cleanName, f.mimetype);
                if (url) {
                    uploadedUrls.push({ url, type: f.mimetype.includes('video') ? 'video' : 'photo' });
                    debugLog(`[API-BC] Média uploadé: ${url}`);
                } else {
                    debugLog(`[API-BC-ERR] L'upload du média "${f.name}" (${f.mimetype}) a échoué. Arrêt du broadcast.`);
                    return res.status(500).json({ error: `Échec de l'upload pour "${f.name}". Le fichier est probablement trop volumineux pour le Storage Supabase.` });
                }
            }

            // 2. Union avec les URLs déjà existantes envoyées par le dashboard (si sélection multiples)
            // S'assurer que les URLs existantes sont aussi des objets
            const normalizedMediaUrls = mediaUrls.map(m => typeof m === 'string' ? { url: m, type: m.match(/\.(mp4|mov|avi|wmv|webm|mkv)/i) ? 'video' : 'photo' } : m);
            const allMedia = [...uploadedUrls, ...normalizedMediaUrls];

            // 3. Sérialisation du message si médias présents (format supporté par broadcastMessage)
            let finalMsg = message;
            if (allMedia.length > 0) {
                finalMsg += `|||MEDIA_URLS|||${JSON.stringify(allMedia)}`;
            }

            // Sauvegarder en DB (sera récupéré par le worker sur Replica 0)
            const broadcastId = await saveBroadcast({
                message: finalMsg,
                target_platform: platform,
                status: 'pending',
                start_at: req.body.start_at || new Date().toISOString(),
                media_count: allMedia.length,
                total_target: 0 // Sera calculé par le worker
            });

            debugLog(`[API-BC-QUEUED] Diffusion #${broadcastId} ajoutée (${allMedia.length} médias)`);
            res.json({ status: 'queued', id: broadcastId });
        } catch (e) {
            debugLog(`[API-BC-CRITICAL] ${e.message}`);
            res.status(500).json({ error: 'Erreur broadcast' });
        }
    });

    app.get('/api/broadcasts', authMiddleware, async (req, res) => {
        try { res.json(await getBroadcastHistory()); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.get('/api/reviews', authMiddleware, async (req, res) => {
        try { res.json(await getReviews(parseInt(req.query.limit) || 100)); }
        catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.post('/api/reviews/delete', authMiddleware, async (req, res) => {
        try {
            await deleteReview(req.body.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    app.delete('/api/broadcasts/:id', authMiddleware, async (req, res) => {
        try {
            await deleteBroadcast(req.params.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
    });

    // ====== SUPPLIERS / FOURNISSEURS ======
    app.get('/api/suppliers', authMiddleware, async (req, res) => {
        try { res.json(await getSuppliers()); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/suppliers/:id', authMiddleware, async (req, res) => {
        try { res.json(await getSupplier(req.params.id)); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/suppliers', authMiddleware, async (req, res) => {
        try {
            const result = await saveSupplier(req.body);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.delete('/api/suppliers/:id', authMiddleware, async (req, res) => {
        try {
            await deleteSupplier(req.params.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/suppliers/:id/products', authMiddleware, async (req, res) => {
        try { res.json(await getSupplierProducts(req.params.id)); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/suppliers/:id/orders', authMiddleware, async (req, res) => {
        try { res.json(await getSupplierOrders(req.params.id)); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ========== MARKETPLACE API ==========

    // Tous les produits marketplace (optionnel: ?supplier_id=xxx)
    app.get('/api/marketplace/products', authMiddleware, async (req, res) => {
        try { 
            const products = await getMarketplaceProducts(req.query.supplier_id || null);
            console.log(`[API] Marketplace products requested (${req.query.supplier_id || 'all'}): found ${products.length}`);
            res.json(products); 
        }
        catch (e) { 
            console.error('[API] Marketplace error:', e.message);
            res.status(500).json({ error: e.message }); 
        }
    });

    // Produits disponibles seulement
    app.get('/api/marketplace/products/available', authMiddleware, async (req, res) => {
        try { res.json(await getAvailableMarketplaceProducts(req.query.supplier_id || null)); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Un produit marketplace
    app.get('/api/marketplace/products/:id', authMiddleware, async (req, res) => {
        try { res.json(await getMarketplaceProduct(req.params.id)); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Créer/modifier un produit marketplace
    app.post('/api/marketplace/products', authMiddleware, async (req, res) => {
        try {
            const result = await saveMarketplaceProduct(req.body);
            res.json({ success: true, product: result });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Supprimer un produit marketplace
    app.delete('/api/marketplace/products/:id', authMiddleware, async (req, res) => {
        try {
            await deleteMarketplaceProduct(req.params.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Mettre à jour le stock
    app.post('/api/marketplace/products/:id/stock', authMiddleware, async (req, res) => {
        try {
            const { updateMarketplaceStock } = require('./services/database');
            await updateMarketplaceStock(req.params.id, parseInt(req.body.stock));
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/marketplace/products/:id/validate', authMiddleware, async (req, res) => {
        try {
            const { validateMarketplaceProduct, saveProduct, getMarketplaceProduct } = require('./services/database');
            await validateMarketplaceProduct(req.params.id, req.body.is_validated);
            
            // Si c'est pour le catalogue principal (Retail) et validé
            if (req.body.is_validated && req.body.promote_to_retail) {
                await require('./services/database').promoteMarketplaceProduct(req.params.id);
            }
            
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/marketplace/products/:id/promote', authMiddleware, async (req, res) => {
        try {
            const { promoteMarketplaceProduct } = require('./services/database');
            const newId = await promoteMarketplaceProduct(req.params.id);
            res.json({ success: true, newId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/marketplace/products/:id/transfer', authMiddleware, async (req, res) => {
        try {
            const { promoteMarketplaceProduct, deleteMarketplaceProduct } = require('./services/database');
            const newId = await promoteMarketplaceProduct(req.params.id);
            await deleteMarketplaceProduct(req.params.id);
            res.json({ success: true, newId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Commandes marketplace
    app.get('/api/marketplace/orders', authMiddleware, async (req, res) => {
        try { res.json(await getMarketplaceOrders(req.query.supplier_id || null, parseInt(req.query.limit) || 50)); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Créer une commande marketplace
    app.post('/api/marketplace/orders', authMiddleware, async (req, res) => {
        try {
            const result = await createMarketplaceOrder(req.body);
            
            // Notify Supplier via Telegram bot
            const bot = getBotInstance();
            if (bot && req.body.supplier_id) {
                const { getSupplier } = require('./services/database');
                const supplier = await getSupplier(req.body.supplier_id);
                if (supplier && supplier.telegram_id) {
                    const productsText = req.body.products.map(p => `• ${p.name} x${p.qty}`).join('\n');
                    const msg = `📢 <b>NOUVELLE COMMANDE ADMIN</b>\n\n📌 <b>Détails :</b>\n${productsText}\n\n💰 Total : ${req.body.total_price}€\n📦 Commande : #${result.id.slice(-5)}\n📍 Livraison : ${req.body.delivery_type === 'pickup' ? 'RETRAIT SUR PLACE' : req.body.address || 'Non spécifié'}`;
                    bot.telegram.sendMessage(supplier.telegram_id.replace('telegram_', ''), msg, { 
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Accepter', callback_data: `mp_accept_${result.id}` }, { text: '❌ Refuser', callback_data: `mp_reject_${result.id}` }],
                                [{ text: '📋 Mes Commandes', callback_data: 'mp_my_orders' }]
                            ]
                        }
                    }).catch(err => {
                        console.error('[Marketplace Notif] Error notifying supplier:', err.message);
                    });
                }
            }
            
            res.json({ success: true, order: result });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Mettre à jour le statut d'une commande marketplace
    app.post('/api/marketplace/orders/:id/status', authMiddleware, async (req, res) => {
        try {
            await updateMarketplaceOrderStatus(req.params.id, req.body.status);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ========== FIN MARKETPLACE API ==========

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
            const idStr = String(userId).replace('telegram_', '');
            const { data: user } = await supabase.from('bot_users').select('data').eq('id', idStr).maybeSingle();
            const history = user?.data?.chat_history || [];

            const enriched = (data || []).map(o => {
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

            let { order, error } = await createOrder(orderData);
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
            const tgId = userId.replace('telegram_', '');

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
            const { getOrder, incrementChatCount, appendChatHistory, getUser } = require('./services/database');
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
            appendChatHistory(order.user_id, {
                role: 'livreur',
                target: 'client',
                text: text,
                orderId: orderId
            }).catch(() => {});

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
            
            const { appendChatHistory } = require('./services/database');
            appendChatHistory(userId, {
                role: 'client',
                target: 'livreur',
                text: text
            }).catch(() => {});

            if (bot) {
                const alertMsg = `💬 <b>CHAT CLIENT (MINI APP)</b>\n\n🆔 Commande : <code>#${shortId}</code>\n👤 De : ${clientName}\n📝 Message : "<i>${text}</i>"`;
                notifyAdmins(bot, alertMsg).catch(() => {});
            }

            res.json({ success: true, chatHistory: chatObj });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/products/reviews', async (req, res) => {
        try {
            const { userId, productId, rating, text } = req.body;
            const { getUser, saveReview } = require('./services/database');
            const user = await getUser(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });
            
            await saveReview({
                user_id: userId,
                product_id: productId,
                rating,
                text,
                first_name: user.first_name,
                username: user.username,
                is_public: true
            });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/delete-account', async (req, res) => {
        try {
            const { userId } = req.body;
            const { deleteUser } = require('./services/database');
            await deleteUser(userId);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/user-address', async (req, res) => {
        try {
            const { userId, address } = req.body;
            const { updateUser } = require('./services/database');
            await updateUser(userId, { address: address });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // ADMIN-CLIENT SUPPORT CHAT (permanent)
    // ═══════════════════════════════════════════════════════════
    // In-memory store: Map<userId, Array<{role, text, ts}>>
    const _adminChats = new Map();

    // Search users to initiate a new chat
    app.get('/api/admin-chat/search', authMiddleware, async (req, res) => {
        try {
            const { q } = req.query;
            if (!q || q.length < 2) return res.json([]);
            const { searchUsers } = require('./services/database');
            const users = await searchUsers(q, 20);
            const results = (users || []).map(u => ({
                userId: u.id,
                username: u.username || '',
                first_name: u.first_name || 'Utilisateur',
                platform_id: u.telegram_id || u.id?.split('_')[1] || u.id,
                hasChat: _adminChats.has(u.id),
                messageCount: (_adminChats.get(u.id) || []).length
            }));
            res.json(results);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/admin-chat/send', async (req, res) => {
        try {
            const { userId, text } = req.body;
            if (!userId || !text) return res.status(400).json({ error: 'Missing fields' });

            const { getUser, updateUser } = require('./services/database');
            const user = await getUser(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const msg = { role: 'client', text, ts: Date.now() };
            const history = user.data?.chat_history || [];
            history.push(msg);
            
            // Save to DB
            const updatedData = { ...user.data, chat_history: history };
            await updateUser(userId, { data: updatedData });

            // Update memory map for real-time list caching
            _adminChats.set(userId, history);

            // Forward to admins via Telegram
            const bot = getBotInstance();
            if (bot) {
                const { notifyAdmins } = require('./services/notifications');
                const { getUser } = require('./services/database');
                const user = await getUser(userId).catch(() => null);
                const name = user?.first_name || userId;
                const uname = user?.username ? `@${user.username}` : `ID:${userId.split('_')[1] || userId}`;
                const adminMsg = `💬 <b>SUPPORT CLIENT (Mini App)</b>\n\n👤 <b>${name}</b> ${uname}\n📝 "${text}"\n\n<i>Répondre via Dashboard → Clients → Chat</i>`;
                await notifyAdmins(bot, adminMsg).catch(() => {});
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/admin-chat/history', async (req, res) => {
        try {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            
            const { getUser } = require('./services/database');
            const user = await getUser(userId).catch(() => null);
            const messages = user?.data?.chat_history || [];
            
            // Sync memory map
            _adminChats.set(userId, messages);
            
            res.json({ messages });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Admin replies to a client from the dashboard
    app.post('/api/admin-chat/reply', authMiddleware, async (req, res) => {
        try {
            const { targetUserId, text, adminName } = req.body;
            if (!targetUserId || !text) return res.status(400).json({ error: 'Missing fields' });

            const { getUser, updateUser } = require('./services/database');
            const user = await getUser(targetUserId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const msg = { role: 'admin', text, ts: Date.now(), from: adminName || 'Support' };
            const history = user.data?.chat_history || [];
            history.push(msg);
            
            // Save to DB
            const updatedData = { ...user.data, chat_history: history };
            await updateUser(targetUserId, { data: updatedData });

            // Update memory map
            _adminChats.set(targetUserId, history);

            // Notify the client via Telegram
            const bot = getBotInstance();
            if (bot) {
                const tgId = targetUserId.split('_')[1];
                if (tgId) {
                    await bot.telegram.sendMessage(tgId,
                        `💬 <b>Réponse du Support</b>\n\n${text}`,
                        { parse_mode: 'HTML' }
                    ).catch(() => {});
                }
            }

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Admin: list all open support chats
    app.get('/api/admin-chat/all', authMiddleware, async (req, res) => {
        try {
            const { searchUsers, getUser } = require('./services/database');
            // We fetch all users who have a chat_history
            // Since we can't easily query JSONB deep keys, we'll fetch recently active users or just return the memory map + any loaded chats
            
            // Sync memory map with any users that have chat_history
            const recentUsers = await searchUsers('', 'all'); 
            for (const u of recentUsers) {
                if (u.data && u.data.chat_history && u.data.chat_history.length > 0) {
                    _adminChats.set(u.id, u.data.chat_history);
                }
            }

            const result = [];
            for (const [userId, messages] of _adminChats.entries()) {
                if (!messages || messages.length === 0) continue;
                const user = await getUser(userId).catch(() => null);
                result.push({
                    userId,
                    username: user?.username || '',
                    first_name: user?.first_name || userId,
                    platform_id: userId.split('_')[1] || userId,
                    lastMessage: messages[messages.length - 1] || null,
                    unreadCount: messages.filter(m => m.role === 'client').length,
                    messages
                });
            }
            result.sort((a, b) => (b.lastMessage?.ts || 0) - (a.lastMessage?.ts || 0));
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.use('/api/*', (req, res) => {
        res.status(404).json({ error: 'Route API non trouvée' });
    });

    // Global error handler for Express
    app.use((err, req, res, next) => {
        console.error('❌ [EXPRESS ERROR]', err);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    });

    // START SERVER
    app.listen(port, () => {
        console.log(`✅ [System] Dashboard accessible sur le port ${port}`);
    });

    return app;
}

module.exports = { createServer, setBotInstance, getBotInstance };

