const { supabase } = require('../config/supabase');
const encryption = require('./encryption');

const COL_USERS = 'bot_users';
const COL_BROADCASTS = 'bot_broadcasts';
const COL_STATS = 'bot_stats';
const COL_SETTINGS = 'bot_settings';
const COL_PRODUCTS = 'bot_products';
const COL_ORDERS = 'bot_orders';
const COL_DAILY_STATS = 'bot_daily_stats';
const COL_REVIEWS = 'bot_reviews';
const COL_REFERRALS = 'bot_referrals';
const COL_SUPPLIERS = 'bot_suppliers';

const DB_TIMEOUT = 10000;
function ts() { return new Date().toISOString(); }

// TTL-based user cache to prevent stale role data (is_livreur, is_approved, etc.)
const USER_CACHE_TTL = 10000; // 10 seconds
const _userCache = new Map(); // Map<docId, { data, ts }>
function _userCacheGet(docId) {
    const entry = _userCache.get(docId);
    if (!entry) return null;
    if (Date.now() - entry.ts > USER_CACHE_TTL) { _userCache.delete(docId); return null; }
    return entry.data;
}
function _userCacheSet(docId, data) { _userCache.set(docId, { data, ts: Date.now() }); }
function _userCacheDelete(docId) { _userCache.delete(docId); }

const _statsCache = {
    overview: null,
    analytics: null,
    ttl: 30000,
    lastOverview: 0,
    lastAnalytics: 0,
    settings: null,
    lastSettings: 0
};

// --- CORE HELPERS ---

function decryptUser(userData) {
    if (!userData) return null;
    // Derive platform_id (raw numeric telegram ID) from the doc ID (telegram_XXXX)
    const rawId = String(userData.id || '');
    const platformId = rawId.includes('_') ? rawId.split('_').pop() : rawId;
    
    let meta = userData.data || {};
    if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
    }

    const decrypted = {
        ...userData,
        doc_id: userData.id,
        platform_id: userData.platform_id || platformId,
        username: encryption.decrypt(userData.username) || userData.username || '',
        first_name: encryption.decrypt(userData.first_name) || userData.first_name || 'Utilisateur',
        last_name: encryption.decrypt(userData.last_name) || userData.last_name || '',
        address: userData.address || meta.address || '',
        platform: userData.platform || 'telegram',
        data: meta,
        is_available: !!(meta.is_available ?? userData.is_available),
        current_city: meta.current_city || userData.current_city || null
    };

    return decrypted;
}

function decryptOrder(order) {
    if (!order) return null;
    return {
        ...order,
        address: encryption.decrypt(order.address) || order.address || '',
        first_name: encryption.decrypt(order.first_name) || order.first_name || '',
        username: encryption.decrypt(order.username) || order.username || '',
    };
}

function decryptReview(review) {
    if (!review) return null;
    let decryptedText = encryption.decrypt(review.text) || review.text || '';
    let parsedMedia = [];
    let productId = review.product_id;
    try {
        const parsed = JSON.parse(decryptedText);
        if (parsed && typeof parsed === 'object') {
            if (parsed.text !== undefined || parsed.media !== undefined) {
                decryptedText = parsed.text || '';
                parsedMedia = parsed.media || [];
                if (parsed.product_id) productId = parsed.product_id;
            }
        }
    } catch(e) {}
    
    return {
        ...review,
        text: decryptedText,
        media: parsedMedia,
        product_id: productId,
        first_name: encryption.decrypt(review.first_name) || review.first_name || '',
        username: encryption.decrypt(review.username) || review.username || '',
    };
}

function makeDocId(platform, platformId) { return `${platform}_${platformId}`; }
function generateReferralCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

// --- INIT ---

async function init() {
    const fs = require('fs');
    const path = require('path');
    const logLine = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        try { fs.appendFileSync(path.join(process.cwd(), 'debug.log'), line); } catch (e) {}
        console.log(msg);
    };

    logLine('📦 Initialisation Database (Supabase) - FARMSTEGRIDY BOT...');
    logLine(`[DB-INIT] Target: ${process.env.SUPABASE_URL}`);
    const key = process.env.SUPABASE_KEY || '';
    logLine(`[DB-INIT] Key Masked: ${key.substring(0, 10)}...${key.substring(key.length - 10)}`);
    logLine(`[DB-INIT] Project Ref: ${process.env.SUPABASE_URL?.match(/https:\/\/(.*?)\./)?.[1]}`);
    try {
        const { data, error } = await supabase.from(COL_STATS).select('id').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (!data) {
            await supabase.from(COL_STATS).insert({ id: 1, total_users: 0 });
        }
        console.log('✅ Database connection OK');
    } catch (e) {
        console.error('❌ Database init error:', e.message);
        throw e;
    }
}

// --- LOCKING ---

async function claimLock(resourceName, ownerId, ttlMs = 60000) {
    const expires = new Date(Date.now() + ttlMs).toISOString();
    const now = new Date().toISOString();
    
    try {
        const { error } = await supabase
            .from(COL_STATS)
            .update({ 
                tg_lock_owner: ownerId, 
                tg_lock_expires: expires 
            })
            .eq('id', 1)
            .or(`tg_lock_owner.is.null,tg_lock_expires.lt.${now},tg_lock_owner.eq.${ownerId}`);

        if (error) {
            if (error.message.includes('column') && (process.env.RAILWAY_REPLICA_COUNT || 1) <= 1) {
                console.warn('[TG-LOCK] ⚠️ Columns missing in bot_stats but only 1 replica detected. Bypassing lock for stability.');
                return true; 
            }
            console.error('[TG-LOCK] claimLock Error:', error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[TG-LOCK] claimLock Error:`, e.message);
        return false;
    }
}

async function checkLock(resourceName, ownerId) {
    const { data } = await supabase.from(COL_STATS).select('tg_lock_owner, tg_lock_expires').eq('id', 1).single();
    if (!data) return null;
    return {
        owner: data.tg_lock_owner,
        expires: data.tg_lock_expires
    };
}

async function releaseLock(resourceName, ownerId) {
    await supabase.from(COL_STATS).update({ tg_lock_owner: null, tg_lock_expires: null }).eq('id', 1).eq('tg_lock_owner', ownerId);
}

async function isLockOwner(resourceName, ownerId) {
    return await checkLock(resourceName, ownerId);
}

// --- USER MANAGEMENT ---

async function getUser(tgId) {
    // Handle both raw numeric IDs ('1183134641') and pre-formatted doc IDs ('telegram_1183134641')
    const docId = String(tgId).startsWith('telegram_') ? String(tgId) : `telegram_${tgId}`;
    const cached = _userCacheGet(docId);
    if (cached) return cached;
    const { data } = await supabase.from(COL_USERS).select('*').eq('id', docId).maybeSingle();
    const user = decryptUser(data);
    if (user) _userCacheSet(docId, user);
    return user;
}

async function registerUser(platformUser, platform = 'telegram', referrerId = null) {
    const docId = makeDocId(platform, platformUser.id);
    const existing = await getUser(platformUser.id); 
    const isNew = !existing;
    
    // 1. Charger les settings
    let autoApprove = true; // Par défaut, on ne restreint pas l'accès
    try {
        const settings = await getAppSettings();
        if (settings && settings.private_mode !== undefined) {
            autoApprove = !settings.private_mode;
        }
        if (settings && settings.auto_approve_new !== undefined) {
            autoApprove = !!settings.auto_approve_new;
        }
    } catch (e) {
        console.error('[DB] Failed to check auto-approve settings:', e.message);
    }

    const encryptedData = {
        id: docId,
        telegram_id: String(platformUser.id),
        platform: platform,
        username: platformUser.username || '',
        first_name: platformUser.first_name || 'Utilisateur',
        last_name: platformUser.last_name || '',
        referral_code: existing?.referral_code || generateReferralCode(),
        referred_by: existing?.referred_by || referrerId,
        is_approved: existing ? existing.is_approved : autoApprove,
        created_at: existing?.created_at || ts()
    };

    if (existing) {
        const needsUpdate = existing.username !== (platformUser.username || '') || existing.first_name !== (platformUser.first_name || 'Utilisateur');
        if (!needsUpdate) return { user: existing, isNew: false };
        // Update in background
        supabase.from(COL_USERS).update(encryptedData).eq('id', docId).then(() => {
            _userCacheSet(docId, decryptUser(encryptedData));
        });
        return { user: { ...existing, ...encryptedData }, isNew: false };
    }
    const { data, error } = await supabase.from(COL_USERS).upsert(encryptedData).select().single();
    
    if (error) {
        console.error('[DB] Register error:', error.message);
        
        // 2. Si l'erreur concerne 'created_at', on réessaie sans ce champ
        if (error.message.includes('created_at')) {
            console.log('[DB] Retrying register without created_at column...');
            delete encryptedData.created_at;
            const { data: data2, error: error2 } = await supabase.from(COL_USERS).upsert(encryptedData).select().single();
            if (!error2) {
                const user = data2;
                if (user) _userCacheSet(docId, user);
                return { user, isNew };
            }
        }

        // Fallback sur l'existant si l'upsert échoue vraiment
        if (existing) return { user: existing, isNew: false };
    }

    const user = data; 
    if (user) _userCacheSet(docId, user);
    
    return { user, isNew };
}

async function updateUser(docId, data) {
    if (data.address !== undefined) {
        const user = await getUser(docId);
        const currentData = user?.data || {};
        data.data = { ...currentData, address: data.address };
        delete data.address;
    }
    const { data: updated, error } = await supabase.from(COL_USERS).update(data).eq('id', docId).select().single();
    if (updated) _userCacheSet(docId, decryptUser(updated));
    return updated;
}

async function searchUsers(query = '', filter = 'all') {
    let q = supabase.from(COL_USERS).select('*');
    
    if (filter === 'pending') {
        q = q.eq('is_approved', false).eq('is_blocked', false);
    } else if (filter === 'approved') {
        q = q.eq('is_approved', true);
    } else if (filter === 'blocked') {
        q = q.eq('is_blocked', true);
    } else if (filter === 'distributors' || filter === 'livreurs') {
        q = q.eq('is_livreur', true);
    }

    // Since username and first_name are encrypted in the DB, we cannot use SQL .ilike for them.
    // We fetch a larger batch, decrypt, and filter in JS.
    const { data } = await q.order('created_at', { ascending: false }).limit(1000);
    let users = (data || []).map(decryptUser);

    if (query) {
        const lowerQuery = query.toLowerCase().replace(/[@#]/g, '');
        users = users.filter(u => {
            const searchStr = `${u.id || ''} ${u.username || ''} ${u.first_name || ''}`.toLowerCase();
            return searchStr.includes(lowerQuery);
        });
    }

    return users.slice(0, 50); // limit the final results
}

async function approveUser(docId) {
    return await updateUser(docId, { is_approved: true });
}

async function getRecentUsers(limit = 200) {
    const { data } = await supabase.from(COL_USERS).select('*').eq('is_approved', true).eq('is_blocked', false).order('created_at', { ascending: false }).limit(limit);
    return (data || []).map(decryptUser);
}

async function getBlockedUsers(limit = 100) {
    const { data } = await supabase.from(COL_USERS).select('*').eq('is_blocked', true).order('created_at', { ascending: false }).limit(limit);
    return (data || []).map(decryptUser);
}

async function getPendingUsers() {
    const { data } = await supabase.from(COL_USERS).select('*').eq('is_approved', false).eq('is_blocked', false).order('created_at', { ascending: false });
    return (data || []).map(decryptUser);
}

async function markUserBlocked(userId) {
    return await updateUser(userId, { is_blocked: true });
}

async function markUserUnblocked(userId) {
    return await updateUser(userId, { is_blocked: false });
}

async function deleteUser(userId) {
    return await supabase.from(COL_USERS).delete().eq('id', userId);
}

async function getAllUsersForBroadcast(platform = null, type = 'user') {
    // Note: 'platform_id' doesn't exist as a column - we use 'id' (format: telegram_XXXX)
    let query = supabase.from(COL_USERS).select('id, telegram_id, username, first_name, last_name, is_blocked, is_livreur, platform');
    
    if (type === 'livreur' || type === 'livreurs') {
        query = query.eq('is_livreur', true);
    } else if (type === 'group') {
        query = query.like('id', '%-%-'); // Groups have different ID format
    } else if (type === 'user') {
        // Only non-livreur users for targeted broadcast
        query = query.eq('is_livreur', false);
    }
    // type === null means ALL users (livreurs + clients)

    if (platform && platform !== 'all') {
        query = query.eq('platform', platform);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[DB] getAllUsersForBroadcast error:', error.message);
        return [];
    }
    // Derive platform_id from the doc id (telegram_1234 -> '1234')
    return (data || []).map(u => ({
        ...u,
        platform_id: u.telegram_id || (String(u.id || '').includes('_') ? String(u.id).split('_').pop() : String(u.id || ''))
    }));
}

// --- PRODUCTS ---

async function getProducts(onlyActive = false) {
    let query = supabase.from(COL_PRODUCTS).select('*');
    if (onlyActive) {
        query = query.eq('is_active', true);
    }
    const { data } = await query.order('created_at', { ascending: true });
    let products = data || [];

    // Deduct active carts stock
    try {
        const { data: settingsData } = await supabase.from(COL_SETTINGS).select('data').eq('key', 'active_carts').maybeSingle();
        if (settingsData && settingsData.data) {
            const allCarts = settingsData.data;
            const lockedStock = {};
            const now = Date.now();
            
            for (const userId in allCarts) {
                const c = allCarts[userId];
                // Lock for 30 mins max
                if (c && c.cart && (now - c.updated_at < 30 * 60 * 1000)) {
                    c.cart.forEach(item => {
                        const qty = (item.n || 1) * (item.m || 1);
                        lockedStock[item.id] = (lockedStock[item.id] || 0) + qty;
                    });
                }
            }

            products = products.map(p => {
                if (lockedStock[p.id]) {
                    p.stock = Math.max(0, p.stock - lockedStock[p.id]);
                }
                return p;
            });
        }
    } catch(e) {
        console.error('[DB] Error calculating locked stock:', e.message);
    }

    return products;
}

async function getProductsByCategory(onlyActive = false) {
    const products = await getProducts(onlyActive);
    const categorized = {};
    products.forEach(p => {
        const cat = p.category || 'Autres';
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(p);
    });
    return categorized;
}

async function getProduct(id) {
    const { data } = await supabase.from(COL_PRODUCTS).select('*').eq('id', id).maybeSingle();
    return data;
}

async function saveProduct(product) {
    if (!product.id) {
        product.id = String(Date.now());
    }

    // Si c'est une mise à jour partielle (ex: juste stock), utiliser update au lieu d'upsert
    // pour éviter les erreurs NOT NULL sur les colonnes absentes
    const { data: existing } = await supabase.from(COL_PRODUCTS).select('id').eq('id', product.id).maybeSingle();

    if (existing) {
        // Produit existant → update partiel (ne touche que les champs fournis)
        const { id, ...updates } = product;
        const { data, error } = await supabase.from(COL_PRODUCTS).update(updates).eq('id', product.id).select().single();
        if (error) throw error;
        return product.id;
    } else {
        // Nouveau produit → insert
        const { data, error } = await supabase.from(COL_PRODUCTS).insert(product).select().single();
        if (error) throw error;
        return product.id;
    }
}

async function saveMarketplaceProduct(product) {
    // For now we use the same table but maybe it has a flag
    return await saveProduct({ ...product, is_marketplace: true });
}

async function deleteProduct(id) {
    return await supabase.from(COL_PRODUCTS).delete().eq('id', id);
}

// --- ORDERS ---

async function createOrder(order) {
    const id = order.id || `order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const encrypted = {
        ...order,
        id,
        address: encryption.encrypt(order.address),
        first_name: encryption.encrypt(order.first_name),
        username: encryption.encrypt(order.username),
        created_at: ts()
    };
    const { data, error } = await supabase.from(COL_ORDERS).insert(encrypted).select().single();
    return { order: data, error };
}

async function getOrder(id) {
    const { data } = await supabase.from(COL_ORDERS).select('*').eq('id', id).maybeSingle();
    return decryptOrder(data);
}

async function getUserOrders(userId) {
    const { data } = await supabase.from(COL_ORDERS).select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return (data || []).map(decryptOrder);
}

async function deleteOrder(id) {
    await supabase.from(COL_ORDERS).delete().eq('id', id);
}

async function getAllOrders(limit = 500) {
    const { data } = await supabase.from(COL_ORDERS).select('*').order('created_at', { ascending: false }).limit(limit);
    return (data || []).map(decryptOrder);
}

async function incrementOrderCount(userId) {
    const { data: user } = await supabase.from(COL_USERS).select('data').eq('id', userId).single();
    const meta = user?.data || {};
    meta.order_count = (meta.order_count || 0) + 1;
    return await supabase.from(COL_USERS).update({ data: meta }).eq('id', userId);
}

// --- SETTINGS ---

async function getAppSettings() {
    const now = Date.now();
    if (_statsCache.settings && (now - _statsCache.lastSettings < 30000)) {
        return _statsCache.settings;
    }
    const { data, error } = await supabase.from(COL_SETTINGS).select('*').eq('id', 'default').maybeSingle();
    if (error) {
        console.error('❌ [DB] getAppSettings error:', error.message);
    }
    const settings = data || {};
    if (!settings.custom_links) settings.custom_links = '[]';
    
    // Assurer que les admins de l'ENV sont présents si la DB est vide ou pour affichage
    const envAdmins = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_IDS || '';
    if (!settings.admin_telegram_id && envAdmins) {
        settings.admin_telegram_id = envAdmins;
    }

    _statsCache.settings = settings;
    _statsCache.lastSettings = now;
    return settings;
}

async function updateAppSettings(data) {
    console.log("♻️ [CACHE] Invaliding settings cache in Farmstegridy Bot");
    _statsCache.settings = null;
    _statsCache.lastSettings = 0; // Invalider le cache
    return await supabase.from(COL_SETTINGS).update(data).eq('id', 'default');
}

// --- BROADCASTS ---

async function getPendingBroadcasts() {
    const { data } = await supabase.from(COL_BROADCASTS).select('*').eq('status', 'pending');
    return data || [];
}

async function updateBroadcast(id, data) {
    return await supabase.from(COL_BROADCASTS).update(data).eq('id', id);
}

async function deleteBroadcast(id) {
    return await supabase.from(COL_BROADCASTS).delete().eq('id', id);
}

async function getBroadcastHistory(limit = 20) {
    const { data } = await supabase.from(COL_BROADCASTS).select('*').order('created_at', { ascending: false }).limit(limit);
    return data || [];
}

async function saveBroadcast(broadcast) {
    const id = require('crypto').randomBytes(10).toString('hex');
    const { data, error } = await supabase.from(COL_BROADCASTS).insert({
        id,
        ...broadcast,
        created_at: ts()
    }).select().single();
    if (error) throw error;
    return id;
}

// --- REVIEWS ---

async function getReviews(limit = 100) {
    const { data } = await supabase.from(COL_REVIEWS).select('*').order('created_at', { ascending: false }).limit(limit);
    return (data || []).map(decryptReview);
}

async function saveReview(review) {
    const payload = JSON.stringify({ text: review.text, media: review.media || [], product_id: review.product_id });
    const id = review.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 5));
    const encrypted = {
        ...review,
        id: id,
        text: encryption.encrypt(payload),
        first_name: encryption.encrypt(review.first_name),
        username: encryption.encrypt(review.username)
    };
    if (!review.id) {
        encrypted.created_at = ts();
    }
    delete encrypted.media;
    delete encrypted.product_id;
    return await supabase.from(COL_REVIEWS).upsert(encrypted);
}

async function deleteReview(id) {
    return await supabase.from(COL_REVIEWS).delete().eq('id', id);
}

// --- MEDIA UPLOAD ---

async function uploadMediaBuffer(buffer, filename, mimetype) {
    try {
        if (!buffer || buffer.length === 0) {
            console.error('[DB] uploadMediaBuffer: Buffer is empty');
            return null;
        }

        let normalizedMimetype = mimetype;
        if (mimetype === 'video/quicktime' || (filename && filename.toLowerCase().endsWith('.mov'))) {
            normalizedMimetype = 'video/mp4';
        }

        const { data, error } = await supabase.storage
            .from('bot_media')
            .upload(filename, buffer, {
                contentType: normalizedMimetype,
                upsert: true
            });
            
        if (error) {
            console.error('[DB] Supabase upload error:', error.message);
            throw error;
        }
        
        const { data: { publicUrl } } = supabase.storage
            .from('bot_media')
            .getPublicUrl(filename);
            
        console.log(`[DB] Media uploaded successfully: ${publicUrl}`);
        return publicUrl;
    } catch (e) {
        console.error('[DB] Media upload exception:', e.message);
        return null;
    }
}

// --- STATS ---

async function getStatsOverview() {
    // Run all counts in parallel for speed
    const results = await Promise.all([
        supabase.from(COL_USERS).select('id', { count: 'exact', head: true }),
        supabase.from(COL_USERS).select('id', { count: 'exact', head: true }).eq('is_approved', true).eq('is_blocked', false).eq('is_livreur', false),
        supabase.from(COL_USERS).select('id', { count: 'exact', head: true }).eq('is_livreur', true),
        supabase.from(COL_USERS).select('id', { count: 'exact', head: true }).eq('is_approved', false).eq('is_blocked', false),
        supabase.from(COL_USERS).select('id', { count: 'exact', head: true }).eq('is_blocked', true),
        supabase.from(COL_ORDERS).select('id', { count: 'exact', head: true }),
        supabase.from(COL_ORDERS).select('total_price').eq('status', 'delivered')
    ]);

    const totalUsers = results[0]?.count || 0;
    const approvedUsers = results[1]?.count || 0;
    const livreurs = results[2]?.count || 0;
    const pending = results[3]?.count || 0;
    const blocked = results[4]?.count || 0;
    const totalOrdersCount = results[5]?.count || 0;
    const deliveredOrders = results[6]?.data || [];

    const totalOrders = totalOrdersCount || 0;
    const totalCA = deliveredOrders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
    const avgBasket = totalOrders > 0 ? (totalCA / totalOrders).toFixed(2) : 0;

    return { 
        totalUsers: totalUsers || 0,
        totalUsersTelegram: totalUsers || 0,

        totalOrders,
        totalCA,
        avgBasket,
        activeUsers: approvedUsers || 0,
        totalLivreurs: livreurs || 0,
        totalPending: pending || 0,
        totalBlocked: blocked || 0,
        actualUserCount: totalUsers || 0,
        _v: "1.0.6"
    };
}

async function getDailyStats(limit = 30) {
    const { data } = await supabase.from(COL_DAILY_STATS).select('*').order('date', { ascending: false }).limit(limit);
    return data || [];
}

// --- SUPPLIERS ---

async function getSuppliers() {
    const { data } = await supabase.from(COL_SUPPLIERS).select('*').order('name');
    return data || [];
}

async function getSupplier(id) {
    const { data } = await supabase.from(COL_SUPPLIERS).select('*').eq('id', id).single();
    return data;
}

async function getSupplierByTelegramId(tgId) {
    const { data } = await supabase.from(COL_SUPPLIERS).select('*').eq('admin_telegram_id', tgId.toString()).single();
    return data;
}

async function saveSupplier(supplier) {
    if (supplier.id) {
        return await supabase.from(COL_SUPPLIERS).update(supplier).eq('id', supplier.id);
    }
    return await supabase.from(COL_SUPPLIERS).insert(supplier);
}

async function deleteSupplier(id) {
    return await supabase.from(COL_SUPPLIERS).delete().eq('id', id);
}

// --- ANALYTICS & HELPERS ---

function extractCityFromAddress(address) {
    if (!address) return { city: 'INCONNUE', postalCode: '', district: '' };
    const cleanAddr = address.replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Look for 5 digits (French postal code)
    const cpMatch = cleanAddr.match(/\b(\d{5})\b/);
    const postalCode = cpMatch ? cpMatch[1] : '';
    
    let city = 'INCONNUE';
    let district = postalCode;
    
    if (postalCode) {
        // Find text after postal code (usually the city)
        const cityMatch = cleanAddr.match(new RegExp(`\\b${postalCode}\\b\\s*([A-Za-zÀ-ÿ\\s-]+)`));
        if (cityMatch && cityMatch[1]) {
            city = cityMatch[1].trim().toUpperCase();
        }
    }

    if (postalCode.startsWith('75')) {
        city = 'PARIS';
        const arr = parseInt(postalCode) - 75000;
        district = `Paris ${arr}e`;
    } else if (city === 'INCONNUE' || city.length < 2) {
        // Try fallback parsing if no CP but maybe city at end
        const parts = cleanAddr.split(',');
        if (parts.length > 1) {
            city = parts[parts.length - 1].trim().toUpperCase();
            city = city.replace(/[0-9]/g, '').trim(); // remove any residual numbers
        } else {
            // Default to Paris if absolutely nothing found (legacy behavior)
            city = 'PARIS';
        }
    }
    
    if (!city) city = 'INCONNUE';

    return { city, postalCode, district };
}

async function getOrderAnalytics() {
    const now = Date.now();
    if (_statsCache.analytics && (now - _statsCache.lastAnalytics < _statsCache.ttl)) {
        return _statsCache.analytics;
    }

    // Auto-backfill silently (max 100 unknown orders per analytics call)
    try {
        const { data: unknownCount } = await supabase.from(COL_ORDERS)
            .select('id', { count: 'exact', head: true })
            .or('city.is.null,city.eq.INCONNUE,city.eq.,city.eq.LE,city.eq.LA,city.eq.DE,city.eq.SAINT,city.eq.INFOS,city.eq.SAINTS,city.eq.FRANCE');
        if (unknownCount && unknownCount > 0) {
            backfillOrderCities(100).catch(() => {}); // fire & forget
        }
    } catch(_) {}

    // Fetch last 2000 orders for historical analysis (optimized fields selection for performance)
    const { data: ordersSnap } = await supabase.from(COL_ORDERS)
        .select('id, created_at, updated_at, total_price, status, product_name, city, postal_code, address, livreur_name, user_id, platform, first_name, username, quantity')
        .order('created_at', { ascending: false })
        .limit(2000);

    const analytics = {
        totalCA: 0,
        totalOrders: 0,
        avgBasket: 0,
        avgDeliveryTime: 0,
        byPlatform: {
            telegram: { ca: 0, count: 0, avgBasket: 0, products: {} }
        },
        byHour: {}, byDay: {}, byWeek: {}, byMonth: {}, byYear: {},
        byCity: {},         // city -> { ca, count, priority }
        byDistrict: {},     // district/postal -> { ca, count, city, topProducts }
        byCityProducts: {}, // city -> { productName -> qty }
        byCityDetail: {},   // city -> { products: {name->qty}, hours: {h->count}, platforms: {p->count}, priority: N }
        byDriver: {}, byUser: {}, byProduct: {},
        priority: {
            total: 0,
            byHour: {},   // hour -> count
            byCity: {},   // city -> count
            byProduct: {},// product -> count
            avgHour: 0    // most common hour
        },
        // Funnel: all client actions
        funnel: {
            catalogViews: 0,      // orders started (any status)
            cartAdds: 0,          // orders that reached cart
            checkouts: 0,         // orders that reached checkout
            completed: 0,         // delivered
            cancelled: 0,         // cancelled
            abandonRate: 0,       // (cartAdds - completed) / cartAdds
        },
        rawDelivered: [],
        cityTable: []
    };

    let totalDeliveryMinutes = 0;
    let deliveryCount = 0;

    (ordersSnap || []).forEach(order => {
        const price = parseFloat(order.total_price) || 0;
        const status = (order.status || '').toLowerCase();
        const isDelivered = status === 'delivered';
        const isCancelled = status === 'cancelled' || status === 'annulée' || status === 'annulee';

        // --- FUNNEL (all orders) ---
        analytics.funnel.catalogViews++;
        if (price > 0 || order.product_name) analytics.funnel.cartAdds++;
        if (price > 0) analytics.funnel.checkouts++;
        if (isDelivered) analytics.funnel.completed++;
        if (isCancelled) analytics.funnel.cancelled++;

        // --- PRIORITY: detect via is_priority OR priority_fee > 0 OR product_list contains 'Prioritaire' ---
        const priorityFee = parseFloat(order.priority_fee) || 0;
        const productListHasPriority = (order.product_list || order.product_name || '').toLowerCase().includes('prioritaire');
        const isPriorityOrder = order.is_priority === true || priorityFee > 0 || productListHasPriority;

        if (isPriorityOrder) {
            analytics.priority.total++;
            if (order.created_at) {
                const h = new Date(order.created_at).getHours() + 'h';
                analytics.priority.byHour[h] = (analytics.priority.byHour[h] || 0) + 1;
            }
            let pCity = (order.city || '').toUpperCase();
            if (!pCity || pCity === 'INCONNUE') {
                const extracted = extractCityFromAddress(encryption.decrypt(order.address));
                pCity = extracted.city || 'INCONNUE';
            }
            if (pCity) analytics.priority.byCity[pCity] = (analytics.priority.byCity[pCity] || 0) + 1;

            const prodP = (order.product_name || 'Inconnu').split('\n')[0].trim();
            analytics.priority.byProduct[prodP] = (analytics.priority.byProduct[prodP] || 0) + 1;
        }

        if (!isDelivered) return; // Only count CA from delivered orders

        analytics.totalCA += price;
        analytics.totalOrders++;

        // Platform
        const platform = order.platform || 'telegram';
        if (!analytics.byPlatform[platform]) {
            analytics.byPlatform[platform] = { ca: 0, count: 0, avgBasket: 0, products: {} };
        }
        analytics.byPlatform[platform].ca += price;
        analytics.byPlatform[platform].count++;

        // Delivery time
        let deliveryMinutes = null;
        if (order.created_at && order.updated_at) {
            const createdMs = new Date(order.created_at).getTime();
            const deliveredMs = new Date(order.updated_at).getTime();
            deliveryMinutes = Math.round((deliveredMs - createdMs) / 60000);
            if (deliveryMinutes > 0 && deliveryMinutes < 1440) {
                totalDeliveryMinutes += deliveryMinutes;
                deliveryCount++;
            }
        }

        // Client
        const clientName = encryption.decrypt(order.first_name) || encryption.decrypt(order.username) || 'Client Inconnu';
        if (!analytics.byUser[clientName]) analytics.byUser[clientName] = { count: 0, ca: 0 };
        analytics.byUser[clientName].count++;
        analytics.byUser[clientName].ca += price;

        // Driver
        const driverName = order.livreur_name || 'Inconnu';
        if (!analytics.byDriver[driverName]) analytics.byDriver[driverName] = { count: 0, ca: 0 };
        analytics.byDriver[driverName].count++;
        analytics.byDriver[driverName].ca += price;

        // Product
        const productName = (order.product_name || 'Inconnu').split('\n')[0].split('(x')[0].trim();
        if (!analytics.byProduct[productName]) analytics.byProduct[productName] = { qty: 0, ca: 0 };
        analytics.byProduct[productName].qty += (parseInt(order.quantity) || 1);
        analytics.byProduct[productName].ca += price;
        if (!analytics.byPlatform[platform].products[productName]) analytics.byPlatform[platform].products[productName] = 0;
        analytics.byPlatform[platform].products[productName] += (parseInt(order.quantity) || 1);

        // Time buckets
        if (order.created_at) {
            const date = new Date(order.created_at);
            const hour = date.getHours().toString().padStart(2, '0') + 'h';
            analytics.byHour[hour] = (analytics.byHour[hour] || 0) + price;
            if (!analytics.byPlatform[platform].byHour) analytics.byPlatform[platform].byHour = {};
            analytics.byPlatform[platform].byHour[hour] = (analytics.byPlatform[platform].byHour[hour] || 0) + price;

            const day = date.toISOString().split('T')[0];
            analytics.byDay[day] = (analytics.byDay[day] || 0) + price;
            if (!analytics.byPlatform[platform].byDay) analytics.byPlatform[platform].byDay = {};
            analytics.byPlatform[platform].byDay[day] = (analytics.byPlatform[platform].byDay[day] || 0) + price;

            const year = date.getFullYear();
            const oneJan = new Date(year, 0, 1);
            const weekNum = Math.ceil((((date - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
            const weekKey = `${year}-W${weekNum}`;
            analytics.byWeek[weekKey] = (analytics.byWeek[weekKey] || 0) + price;
            if (!analytics.byPlatform[platform].byWeek) analytics.byPlatform[platform].byWeek = {};
            analytics.byPlatform[platform].byWeek[weekKey] = (analytics.byPlatform[platform].byWeek[weekKey] || 0) + price;

            const month = date.toISOString().substring(0, 7);
            analytics.byMonth[month] = (analytics.byMonth[month] || 0) + price;
            if (!analytics.byPlatform[platform].byMonth) analytics.byPlatform[platform].byMonth = {};
            analytics.byPlatform[platform].byMonth[month] = (analytics.byPlatform[platform].byMonth[month] || 0) + price;

            const yr = date.getFullYear().toString();
            analytics.byYear[yr] = (analytics.byYear[yr] || 0) + price;
            if (!analytics.byPlatform[platform].byYear) analytics.byPlatform[platform].byYear = {};
            analytics.byPlatform[platform].byYear[yr] = (analytics.byPlatform[platform].byYear[yr] || 0) + price;
        }

        // --- GEO: City + District + Detail ---
        let city = (order.city || '').split(',')[0].trim().toUpperCase();
        let postalCode = order.postal_code || '';
        let district = order.district || '';

        // If any piece of geo info is missing or invalid, decrypt once and extract
        const isBadCity = !city || city === 'INCONNUE' || city.length < 2 || ['RUE', 'AVENUE', 'BOULEVARD'].some(k => city.startsWith(k));
        if (isBadCity || !district || !postalCode) {
            const fullAddr = encryption.decrypt(order.address);
            if (fullAddr) {
                const extracted = extractCityFromAddress(fullAddr);
                if (isBadCity) city = (extracted.city || 'INCONNUE').toUpperCase();
                if (!postalCode) postalCode = extracted.postalCode;
                if (!district) district = extracted.district;
            }
        }
        
        // Fallback for district if still missing
        if (!district) district = postalCode || 'INCONNUE';

        // byCity
        if (!analytics.byCity[city]) analytics.byCity[city] = { ca: 0, count: 0, priority: 0 };
        analytics.byCity[city].ca += price;
        analytics.byCity[city].count++;
        if (isPriorityOrder) analytics.byCity[city].priority++;

        // byDistrict (postal-code level)
        if (district || postalCode) {
            const distKey = district || postalCode;
            if (!analytics.byDistrict[distKey]) analytics.byDistrict[distKey] = { ca: 0, count: 0, city, products: {}, priority: 0 };
            analytics.byDistrict[distKey].ca += price;
            analytics.byDistrict[distKey].count++;
            analytics.byDistrict[distKey].city = city;
            if (isPriorityOrder) analytics.byDistrict[distKey].priority++;
            analytics.byDistrict[distKey].products[productName] = (analytics.byDistrict[distKey].products[productName] || 0) + (parseInt(order.quantity) || 1);
        }

        // Top products per city
        if (!analytics.byCityProducts[city]) analytics.byCityProducts[city] = {};
        analytics.byCityProducts[city][productName] = (analytics.byCityProducts[city][productName] || 0) + (parseInt(order.quantity) || 1);

        // City Detail (for drill-down)
        if (!analytics.byCityDetail[city]) analytics.byCityDetail[city] = { products: {}, hours: {}, platforms: {}, priority: 0, districts: {} };
        analytics.byCityDetail[city].products[productName] = (analytics.byCityDetail[city].products[productName] || 0) + (parseInt(order.quantity) || 1);
        if (order.created_at) {
            const h = new Date(order.created_at).getHours() + 'h';
            analytics.byCityDetail[city].hours[h] = (analytics.byCityDetail[city].hours[h] || 0) + 1;
        }
        analytics.byCityDetail[city].platforms[platform] = (analytics.byCityDetail[city].platforms[platform] || 0) + 1;
        if (isPriorityOrder) analytics.byCityDetail[city].priority++;
        if (district) analytics.byCityDetail[city].districts[district] = (analytics.byCityDetail[city].districts[district] || 0) + 1;

        analytics.rawDelivered.push({
            id: order.id,
            date: order.created_at ? new Date(order.created_at).toLocaleString('fr-FR') : '?',
            delivered_date: order.delivered_at ? new Date(order.delivered_at).toLocaleString('fr-FR') : null,
            delivery_time: deliveryMinutes,
            client: clientName,
            product: order.product_name,
            qty: order.quantity,
            price: price,
            city: city,
            district: district || postalCode,
            livreur: order.livreur_name || 'N/A',
            platform: platform,
            is_priority: isPriorityOrder,
            chat_count: order.chat_count || 0,
            user_id: order.user_id
        });
    });

    // Build city table (with top-3 products per city)
    analytics.cityTable = Object.entries(analytics.byCity)
        .map(([city, data]) => {
            const products = analytics.byCityProducts[city] || {};
            const topProducts = Object.entries(products).sort((a,b) => b[1]-a[1]).slice(0, 3).map(([n, q]) => ({ name: n, qty: q }));
            const topProduct = topProducts[0] ? topProducts[0].name : '—';
            // District breakdown for this city
            const districts = Object.entries(analytics.byDistrict)
                .filter(([, d]) => d.city === city)
                .sort((a,b) => b[1].ca - a[1].ca)
                .slice(0, 10)
                .map(([dist, d]) => ({
                    district: dist,
                    ca: parseFloat(d.ca.toFixed(2)),
                    count: d.count,
                    priority: d.priority,
                    topProduct: Object.entries(d.products).sort((a,b) => b[1]-a[1])[0]?.[0] || '—'
                }));
            return {
                city,
                ca: parseFloat(data.ca.toFixed(2)),
                count: data.count,
                avgBasket: data.count > 0 ? parseFloat((data.ca / data.count).toFixed(2)) : 0,
                topProduct,
                topProducts,
                priorityCount: analytics.priority.byCity[city] || data.priority || 0,
                districts
            };
        })
        .sort((a, b) => b.ca - a.ca);

    // Funnel rates
    analytics.funnel.abandonRate = analytics.funnel.cartAdds > 0
        ? Math.round(((analytics.funnel.cartAdds - analytics.funnel.completed) / analytics.funnel.cartAdds) * 100)
        : 0;

    // Most requested priority hour
    const priorityHours = Object.entries(analytics.priority.byHour).sort((a,b) => b[1]-a[1]);
    analytics.priority.avgHour = priorityHours[0] ? priorityHours[0][0] : 'N/A';

    // Finalize averages
    analytics.avgBasket = analytics.totalOrders > 0 ? parseFloat((analytics.totalCA / analytics.totalOrders).toFixed(2)) : 0;
    Object.keys(analytics.byPlatform).forEach(p => {
        const plat = analytics.byPlatform[p];
        plat.avgBasket = plat.count > 0 ? parseFloat((plat.ca / plat.count).toFixed(2)) : 0;
    });
    analytics.avgDeliveryTime = deliveryCount > 0 ? Math.round(totalDeliveryMinutes / deliveryCount) : 0;

    _statsCache.analytics = analytics;
    _statsCache.lastAnalytics = now;
    return analytics;
}

// --- MISSING FUNCTIONS (Order flow, Livreurs, Marketplace, etc.) ---

// ORDER STATUS & MANAGEMENT
async function updateOrderStatus(orderId, status, extraData = {}) {
    const updateData = { status, ...extraData };
    const { data, error } = await supabase.from(COL_ORDERS).update(updateData).eq('id', orderId).select().single();
    if (error) console.error('[DB] updateOrderStatus error:', error.message);
    
    // Invalidate stats cache so dashboard updates immediately
    _statsCache.lastAnalytics = 0;
    
    // Si la commande est annulée ou refusée, on restocke !
    if (status === 'cancelled' || status === 'refused') {
        adjustOrderStock(orderId, 'increment').catch(e => console.error("Stock restore error:", e));
    }
    
    return data;
}

async function adjustOrderStock(orderId, action) {
    const { data: order } = await supabase.from(COL_ORDERS).select('*').eq('id', orderId).maybeSingle();
    if (!order || !order.notes) return;
    try {
        const cart = JSON.parse(order.notes);
        if (!Array.isArray(cart)) return;
        const { logStockMovement } = require('./inventory_manager');
        
        for (const item of cart) {
            const productId = item.productId || item.id;
            const qty = action === 'increment' ? item.qty : -item.qty;
            
            const { data: p } = await supabase.from(COL_PRODUCTS).select('id, stock, discounts_config, name').eq('id', productId).maybeSingle();
            if (p) {
                const packageIndex = item.packageIndex || 0;
                let newStock = 0;
                let isBase = packageIndex === 0;
                
                if (isBase && typeof p.stock === 'number') {
                    newStock = Math.max(0, p.stock + qty);
                    const updates = { stock: newStock };
                    
                    let alertMsg = null;
                    if (action === 'decrement') {
                        if (newStock <= 0 && p.stock > 0) {
                            updates.is_active = false;
                            updates.is_available = false;
                            alertMsg = `🚫 <b>Rupture de Stock</b>\nLe produit <b>${p.name}</b> (Base) est épuisé. Il a été automatiquement masqué.`;
                        } else if (newStock <= 2 && p.stock > 2) {
                            alertMsg = `⚠️ <b>Alerte Stock Critique (${newStock} restants)</b>\nLe produit <b>${p.name}</b> (Base) n'a plus que ${newStock} unités en stock ! Veuillez réapprovisionner au plus vite.`;
                        } else if (newStock <= 5 && p.stock > 5) {
                            alertMsg = `⚠️ <b>Alerte Stock Bas (${newStock} restants)</b>\nLe produit <b>${p.name}</b> (Base) n'a plus que ${newStock} unités en stock. Pensez à réapprovisionner !`;
                        }
                    }
                    
                    await supabase.from(COL_PRODUCTS).update(updates).eq('id', productId);
                    if (alertMsg) {
                        try {
                            const { notifyAdmins } = require('./notifications');
                            await notifyAdmins(null, alertMsg);
                        } catch(err) {
                            console.error("Error sending stock alert from DB:", err.message);
                        }
                    }
                } else if (!isBase && Array.isArray(p.discounts_config) && p.discounts_config[packageIndex - 1]) {
                    const dc = p.discounts_config;
                    const pkg = dc[packageIndex - 1];
                    const oldStock = pkg.stock || 0;
                    pkg.stock = Math.max(0, oldStock + qty);
                    newStock = pkg.stock;
                    
                    // On déduit également du stock global du produit
                    const newGlobalStock = Math.max(0, (p.stock || 0) + qty);
                    
                    let alertMsg = null;
                    if (action === 'decrement') {
                        if (newStock <= 0 && oldStock > 0) {
                            alertMsg = `🚫 <b>Rupture de Stock</b>\nLe produit <b>${p.name}</b> (Format x${pkg.qty}) est épuisé.`;
                        } else if (newStock <= 2 && oldStock > 2) {
                            alertMsg = `⚠️ <b>Alerte Stock Critique (${newStock} restants)</b>\nLe produit <b>${p.name}</b> (Format x${pkg.qty}) n'a plus que ${newStock} unités.`;
                        }
                    }
                    
                    await supabase.from(COL_PRODUCTS).update({ discounts_config: dc, stock: newGlobalStock }).eq('id', productId);
                    if (alertMsg) {
                        try {
                            const { notifyAdmins } = require('./notifications');
                            await notifyAdmins(null, alertMsg);
                        } catch(err) {
                            console.error("Error sending stock alert from DB:", err.message);
                        }
                    }
                }
                
                await logStockMovement(productId, qty, `order_${action}_pkg${packageIndex}`, orderId);
            }
        }
    } catch(e) {
        console.error('[DB] adjustOrderStock error:', e.message);
    }
}

async function assignOrderLivreur(orderId, livreurId, livreurName) {
    const res = await supabase.from(COL_ORDERS).update({
        livreur_id: livreurId,
        livreur_name: livreurName,
        status: 'taken'
    }).eq('id', orderId);
    
    _statsCache.lastAnalytics = 0;
    return res;
}

async function getOrdersByUser(userId) {
    const { data } = await supabase.from(COL_ORDERS).select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return (data || []).map(decryptOrder);
}

async function getClientActiveOrders(userId) {
    const { data } = await supabase.from(COL_ORDERS).select('*')
        .eq('user_id', userId)
        .in('status', ['pending', 'taken', 'supplier_pending', 'supplier_accepted'])
        .order('created_at', { ascending: false });
    return (data || []).map(decryptOrder);
}

async function getAvailableOrders() {
    const { data } = await supabase.from(COL_ORDERS).select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    return (data || []).map(decryptOrder);
}

async function searchOrders(query) {
    if (!query) return getAllOrders(100);
    const { data } = await supabase.from(COL_ORDERS).select('*')
        .or(`id.ilike.%${query}%,product_name.ilike.%${query}%,username.ilike.%${query}%`)
        .order('created_at', { ascending: false }).limit(50);
    return (data || []).map(decryptOrder);
}

async function backfillOrderCities() {
    const { data: orders } = await supabase.from(COL_ORDERS).select('id, address').is('city', null);
    let updated = 0;
    for (const order of (orders || [])) {
        const { city, postalCode } = extractCityFromAddress(encryption.decrypt(order.address) || order.address);
        await supabase.from(COL_ORDERS).update({ city, postal_code: postalCode }).eq('id', order.id);
        updated++;
    }
    return { updated };
}

// SUPPLIER ORDER HELPERS
async function markOrderSupplierReady(orderId) {
    return await supabase.from(COL_ORDERS).update({ supplier_ready: true }).eq('id', orderId);
}

async function markOrderSupplierNotified(orderId) {
    return await supabase.from(COL_ORDERS).update({ supplier_notified: true }).eq('id', orderId);
}

// LIVREUR MANAGEMENT
async function setLivreurStatus(platformId, platform, isLivreur) {
    const docId = makeDocId(platform, platformId);
    const { data, error } = await supabase.from(COL_USERS).update({ is_livreur: isLivreur }).eq('id', docId).select().single();
    if (data) _userCacheDelete(docId);
    return data;
}

async function setLivreurAvailability(docId, isAvailable) {
    const { data } = await supabase.from(COL_USERS).select('data').eq('id', docId).maybeSingle();
    const meta = data?.data || {};
    meta.is_available = isAvailable;
    await supabase.from(COL_USERS).update({ is_available: isAvailable, data: meta }).eq('id', docId);
    _userCacheDelete(docId);
}

async function updateLivreurPosition(docId, city) {
    const { data } = await supabase.from(COL_USERS).select('data').eq('id', docId).maybeSingle();
    const meta = data?.data || {};
    meta.current_city = city;
    await supabase.from(COL_USERS).update({ current_city: city, data: meta }).eq('id', docId);
    _userCacheDelete(docId);
}

async function getAllLivreurs() {
    const { data } = await supabase.from(COL_USERS).select('*').eq('is_livreur', true).order('created_at', { ascending: false });
    return (data || []).map(decryptUser);
}

async function setAdminStatus(docId, isAdmin) {
    const { data, error } = await supabase.from(COL_USERS).update({ is_admin: isAdmin }).eq('id', docId).select().single();
    if (data) _userCacheDelete(docId);
    return data;
}

async function setModeratorStatus(docId, isModerator) {
    const { data, error } = await supabase.from(COL_USERS).update({ is_moderator: isModerator }).eq('id', docId).select().single();
    if (data) _userCacheDelete(docId);
    return data;
}

async function getAllAdmins() {
    const { data } = await supabase.from(COL_USERS).select('*').eq('is_admin', true);
    return (data || []).map(decryptUser);
}

async function getAllModerators() {
    const { data } = await supabase.from(COL_USERS).select('*').eq('is_moderator', true);
    return (data || []).map(decryptUser);
}

async function searchLivreurs(query) {
    let q = supabase.from(COL_USERS).select('*').eq('is_livreur', true);
    if (query) {
        q = q.or(`id.ilike.%${query}%,username.ilike.%${query}%,first_name.ilike.%${query}%`);
    }
    const { data } = await q.order('created_at', { ascending: false }).limit(50);
    return (data || []).map(decryptUser);
}

async function getDetailedLivreurActivity(livreurId) {
    const { data } = await supabase.from(COL_ORDERS).select('*')
        .eq('livreur_id', livreurId)
        .order('created_at', { ascending: false }).limit(50);
    return (data || []).map(decryptOrder);
}

async function getLivreurHistory(livreurId) {
    return getDetailedLivreurActivity(livreurId);
}

async function getLivreurOrders(livreurId) {
    const { data } = await supabase.from(COL_ORDERS).select('*')
        .eq('livreur_id', String(livreurId))
        .in('status', ['taken', 'accepted', 'near', 'arrived'])
        .order('created_at', { ascending: false });
    return (data || []).map(decryptOrder);
}

// USER STATS & WALLET
async function getUserCount() {
    const { count } = await supabase.from(COL_USERS).select('*', { count: 'exact', head: true });
    return count || 0;
}

async function getActiveUserCount() {
    const { count } = await supabase.from(COL_USERS).select('*', { count: 'exact', head: true }).eq('is_approved', true).eq('is_blocked', false);
    return count || 0;
}

async function updateUserWallet(userId, amount) {
    const { data: user } = await supabase.from(COL_USERS).select('data').eq('id', userId).single();
    const meta = user?.data || {};
    meta.wallet = (parseFloat(meta.wallet) || 0) + parseFloat(amount);
    return await supabase.from(COL_USERS).update({ data: meta }).eq('id', userId);
}

async function updateUserPoints(userId, points) {
    const { data: user } = await supabase.from(COL_USERS).select('data').eq('id', userId).single();
    const meta = user?.data || {};
    meta.points = (parseInt(meta.points) || 0) + parseInt(points);
    return await supabase.from(COL_USERS).update({ data: meta }).eq('id', userId);
}

async function getReferralLeaderboard(limit = 10) {
    const { data } = await supabase.from(COL_REFERRALS).select('referrer_id')
        .eq('status', 'completed');
    // Count referrals per user
    const counts = {};
    (data || []).forEach(r => { counts[r.referrer_id] = (counts[r.referrer_id] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
    // Enrich with user data
    const result = [];
    for (const [userId, count] of sorted) {
        const user = await getUser(userId.replace('telegram_', ''));
        result.push({ user_id: userId, count, username: user?.username || 'Inconnu', first_name: user?.first_name || '' });
    }
    return result;
}

async function getGlobalStats() {
    return getStatsOverview();
}

// FEEDBACK & HELP
async function logHelpRequest(userId, message) {
    console.log(`[HELP] ${userId}: ${message}`);
    return true;
}

async function saveClientReply(orderId, userId, message) {
    console.log(`[CLIENT-REPLY] Order ${orderId} from ${userId}: ${message}`);
    return true;
}

async function incrementChatCount(orderId) {
    const { data } = await supabase.from(COL_ORDERS).select('chat_count').eq('id', orderId).maybeSingle();
    const count = (data?.chat_count || 0) + 1;
    await supabase.from(COL_ORDERS).update({ chat_count: count }).eq('id', orderId);
    return count; // CRITICAL: must return count for display
}


async function appendChatHistory(userId, msgObj) {
    try {
        const idStr = String(userId).startsWith('telegram_') ? String(userId) : `telegram_${userId}`;
        const { data: user } = await supabase.from(COL_USERS).select('data').eq('id', idStr).maybeSingle();
        if (!user) return false;
        
        const history = user.data?.chat_history || [];
        // Ne pas stocker un historique infini, garder les 100 derniers
        if (history.length > 100) history.shift();
        
        history.push({ ...msgObj, ts: Date.now() });
        const newData = { ...user.data, chat_history: history };
        
        const { error } = await supabase.from(COL_USERS).update({ data: newData }).eq('id', idStr);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('[DB] appendChatHistory error:', err.message);
        return false;
    }
}

const pendingFeedbacks = new Map();

async function setPendingFeedback(userId, orderId, rate) {
    pendingFeedbacks.set(userId, { orderId, rate });
}

async function getAndClearPendingFeedback(userId) {
    const pending = pendingFeedbacks.get(userId);
    if (pending) {
        pendingFeedbacks.delete(userId);
        return pending;
    }
    return null;
}

async function saveFeedback(userId, feedback) {
    console.log(`[FEEDBACK] ${userId}: ${JSON.stringify(feedback)}`);
    return true;
}

// MEDIA HELPER
async function uploadMediaFromUrl(url) {
    try {
        const https = require('https');
        const http = require('http');
        const mod = url.startsWith('https') ? https : http;
        return new Promise((resolve) => {
            mod.get(url, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', async () => {
                    const buffer = Buffer.concat(chunks);
                    const contentType = res.headers['content-type'] || '';
                    let ext = '.jpg';
                    let mimetype = 'image/jpeg';
                    
                    if (contentType.includes('video/mp4') || url.includes('.mp4')) { ext = '.mp4'; mimetype = 'video/mp4'; }
                    else if (contentType.includes('video/quicktime') || url.includes('.mov')) { ext = '.mov'; mimetype = 'video/quicktime'; }
                    else if (contentType.includes('image/png') || url.includes('.png')) { ext = '.png'; mimetype = 'image/png'; }
                    else if (contentType.includes('image/gif') || url.includes('.gif')) { ext = '.gif'; mimetype = 'image/gif'; }
                    else if (contentType.includes('video')) { ext = '.mp4'; mimetype = contentType; }
                    
                    const filename = `media_${Date.now()}_${Math.floor(Math.random()*1000)}${ext}`;
                    const publicUrl = await uploadMediaBuffer(buffer, filename, mimetype);
                    resolve(publicUrl);
                });
                res.on('error', () => resolve(null));
            }).on('error', () => resolve(null));
        });
    } catch (e) {
        console.error('[DB] uploadMediaFromUrl error:', e.message);
        return null;
    }
}

// MARKETPLACE FUNCTIONS
async function getMarketplaceProducts(supplierId) {
    let q = supabase.from(COL_PRODUCTS).select('*').eq('is_marketplace', true);
    if (supplierId) q = q.eq('supplier_id', supplierId);
    const { data } = await q.order('name');
    return data || [];
}

async function getMarketplaceProduct(id) {
    const { data } = await supabase.from(COL_PRODUCTS).select('*').eq('id', id).eq('is_marketplace', true).maybeSingle();
    return data;
}

async function getAvailableMarketplaceProducts(supplierId) {
    let q = supabase.from(COL_PRODUCTS).select('*').eq('is_marketplace', true).eq('is_active', true);
    if (supplierId) q = q.eq('supplier_id', supplierId);
    const { data } = await q.order('name');
    return data || [];
}

async function deleteMarketplaceProduct(id) {
    return await supabase.from(COL_PRODUCTS).delete().eq('id', id).eq('is_marketplace', true);
}

async function updateMarketplaceStock(id, stock) {
    return await supabase.from(COL_PRODUCTS).update({ stock }).eq('id', id);
}

async function validateMarketplaceProduct(id, validated) {
    return await supabase.from(COL_PRODUCTS).update({ is_active: validated }).eq('id', id);
}

async function createMarketplaceOrder(order) {
    const id = order.id || `mp_order_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const { data, error } = await supabase.from(COL_ORDERS).insert({ ...order, id }).select().single();
    return { order: data, error };
}

async function getMarketplaceOrders(supplierId, limit = 50) {
    const { data } = await supabase.from(COL_ORDERS).select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false }).limit(limit);
    return (data || []).map(decryptOrder);
}

async function getMarketplaceOrder(id) {
    return getOrder(id);
}

async function updateMarketplaceOrderStatus(orderId, status) {
    return updateOrderStatus(orderId, status);
}

async function getSupplierProducts(supplierId) {
    const { data } = await supabase.from(COL_PRODUCTS).select('*').eq('supplier_id', supplierId).order('name');
    return data || [];
}

async function getSupplierOrders(supplierId, limit = 50) {
    const { data } = await supabase.from(COL_ORDERS).select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false }).limit(limit);
    return (data || []).map(decryptOrder);
}

async function getSupplierDeliveryMode(supplierId) {
    const supplier = await getSupplier(supplierId);
    return supplier?.delivery_mode || 'both';
}

// NUKE
async function nukeDatabase() {
    console.warn('[DB] ⚠️ NUKE DATABASE REQUESTED');
    await supabase.from(COL_ORDERS).delete().neq('id', '');
    await supabase.from(COL_REVIEWS).delete().neq('id', '');
    await supabase.from(COL_BROADCASTS).delete().neq('id', '');
    await supabase.from(COL_REFERRALS).delete().neq('id', '');
    await supabase.from(COL_USERS).delete().neq('id', '');
    await supabase.from(COL_PRODUCTS).delete().neq('id', '');
    await supabase.from(COL_STATS).update({ total_users: 0, total_orders: 0, total_ca: 0 }).eq('id', '1');
    console.warn('[DB] ⚠️ NUKE COMPLETE');
}

// DAILY STATS (proper implementation)
async function incrementDailyStat(stat) {
    const today = new Date().toISOString().split('T')[0];
    try {
        // Try to get today's record
        const { data: existing } = await supabase.from(COL_DAILY_STATS).select('*').eq('date', today).maybeSingle();
        if (existing) {
            const val = (existing[stat] || 0) + 1;
            await supabase.from(COL_DAILY_STATS).update({ [stat]: val }).eq('id', existing.id);
        } else {
            await supabase.from(COL_DAILY_STATS).insert({ date: today, [stat]: 1 });
        }
    } catch (e) {
        console.error(`[DB] incrementDailyStat(${stat}) error:`, e.message);
    }
}

// HELPER ALIAS
function getPublicReviews(limit) { return getReviews(limit); }

// --- MODULE EXPORTS ---

const database = {
    init,
    initialize: init,
    getAppSettings,
    updateAppSettings,
    registerUser,
    getUser,
    updateUser,
    approveUser,
    searchUsers,
    createOrder,
    getOrder,
    getUserOrders,
    deleteOrder,
    getProducts,
    getProductsByCategory,
    getProduct,
    saveProduct,
    saveMarketplaceProduct,
    deleteProduct,
    claimLock,
    checkLock,
    releaseLock,
    isLockOwner,
    getSuppliers,
    getSupplier,
    getSupplierByTelegramId,
    saveSupplier,
    deleteSupplier,
    getAllUsersForBroadcast,
    getStatsOverview,
    getDailyStats,
    getOrderAnalytics,
    getBroadcastHistory,
    getPendingBroadcasts,
    saveBroadcast,
    updateBroadcast,
    deleteBroadcast,
    getReviews,
    saveReview,
    deleteReview,
    uploadMediaBuffer,
    uploadMediaFromUrl,
    decryptUser,
    decryptOrder,
    decryptReview,
    getRecentUsers,
    getBlockedUsers,
    getPendingUsers,
    markUserBlocked,
    markUserUnblocked,
    deleteUser,
    getAllOrders,
    incrementOrderCount,
    incrementDailyStat,
    // Order management
    updateOrderStatus,
    adjustOrderStock,
    assignOrderLivreur,
    getOrdersByUser,
    getClientActiveOrders,
    getAvailableOrders,
    searchOrders,
    backfillOrderCities,
    markOrderSupplierReady,
    markOrderSupplierNotified,
    setAdminStatus,
    setModeratorStatus,
    getAllAdmins,
    getAllModerators,
    // Livreur management
    setLivreurStatus,
    setLivreurAvailability,
    updateLivreurPosition,
    getAllLivreurs,
    searchLivreurs,
    getDetailedLivreurActivity,
    getLivreurHistory,
    getLivreurOrders,
    // User stats
    getUserCount,
    getActiveUserCount,
    updateUserWallet,
    updateUserPoints,
    getReferralLeaderboard,
    getGlobalStats,
    // Feedback & help
    logHelpRequest,
    saveClientReply,
    appendChatHistory,
    incrementChatCount,
    getAndClearPendingFeedback,
    setPendingFeedback,
    saveFeedback,
    getPublicReviews,
    // Marketplace
    getMarketplaceProducts,
    getMarketplaceProduct,
    getAvailableMarketplaceProducts,
    deleteMarketplaceProduct,
    updateMarketplaceStock,
    validateMarketplaceProduct,
    createMarketplaceOrder,
    getMarketplaceOrders,
    getMarketplaceOrder,
    updateMarketplaceOrderStatus,
    getSupplierProducts,
    getSupplierOrders,
    getSupplierDeliveryMode,
    // Admin
    nukeDatabase,
    // Helpers
    makeDocId,
    extractCityFromAddress,
    _userCache,
    addMessageToTrack: async (userId, msgId) => {
        // Non-blocking background update
        (async () => {
            try {
                // On utilise le cache si possible
                let tracked = [];
                const cachedUser = _userCacheGet(userId);
                if (cachedUser && cachedUser.tracked_messages) {
                    tracked = cachedUser.tracked_messages;
                } else {
                    const { data: user } = await supabase.from(COL_USERS).select('tracked_messages').eq('id', userId).maybeSingle();
                    tracked = user?.tracked_messages || [];
                }

                if (!tracked.includes(msgId)) {
                    tracked.push(msgId);
                    const finalTracked = tracked.slice(-50);
                    await supabase.from(COL_USERS).update({ tracked_messages: finalTracked }).eq('id', userId);
                    if (cachedUser) {
                        cachedUser.tracked_messages = finalTracked;
                        _userCacheSet(userId, cachedUser);
                    }
                }
            } catch (e) {
                console.error('[DB] Add tracked message failed:', e.message);
            }
        })();
    },
    getTrackedMessages: async (userId) => {
        try {
            const { data: user } = await supabase.from(COL_USERS).select('tracked_messages').eq('id', userId).maybeSingle();
            return user?.tracked_messages || [];
        } catch (e) {
            return [];
        }
    },
    clearTrackedMessages: async (userId) => {
        try {
            await supabase.from(COL_USERS).update({ tracked_messages: [] }).eq('id', userId);
        } catch (e) {}
    },
    deleteOldMessages: async (userId) => {
        return true;
    },
    getLastMenuId: async (userId) => {
        try {
            const { data: user } = await supabase.from(COL_USERS).select('last_menu_id').eq('id', userId).maybeSingle();
            return user?.last_menu_id;
        } catch (e) { return null; }
    },
    setLastMenuId: async (userId, msgId) => {
        try {
            await supabase.from(COL_USERS).update({ last_menu_id: msgId }).eq('id', userId);
        } catch (e) {}
    },
    syncUserCart: async (userId, cart) => {
        try {
            const { data: settings } = await supabase.from(COL_SETTINGS).select('data').eq('key', 'active_carts').single();
            const carts = settings ? (settings.data || {}) : {};
            
            if (!cart || cart.length === 0) {
                delete carts[userId];
            } else {
                carts[userId] = {
                    cart: cart,
                    updated_at: Date.now(),
                    notified: false
                };
            }
            
            if (settings) {
                await supabase.from(COL_SETTINGS).update({ data: carts }).eq('key', 'active_carts');
            } else {
                await supabase.from(COL_SETTINGS).insert([{ key: 'active_carts', data: carts }]);
            }
        } catch (e) {}
    },
    trackUserView: async (userId, viewData) => {
        try {
            const { data: settings } = await supabase.from(COL_SETTINGS).select('data').eq('key', 'user_views').maybeSingle();
            const views = settings ? (settings.data || {}) : {};
            
            if (!views[userId]) views[userId] = [];
            views[userId].push(viewData);
            
            // Keep only the last 50 views per user to prevent bloat
            if (views[userId].length > 50) {
                views[userId] = views[userId].slice(-50);
            }
            
            if (settings) {
                await supabase.from(COL_SETTINGS).update({ data: views }).eq('key', 'user_views');
            } else {
                await supabase.from(COL_SETTINGS).insert([{ key: 'user_views', data: views }]);
            }
        } catch (e) {}
    },
    getUserAnalytics: async (userId) => {
        try {
            // Fetch views
            const { data: settings } = await supabase.from(COL_SETTINGS).select('data').eq('key', 'user_views').maybeSingle();
            const views = settings ? (settings.data && settings.data[userId] ? settings.data[userId] : []) : [];
            
            // Fetch orders
            const { data: orders } = await supabase.from(COL_ORDERS).select('id, created_at, product_id, product_name, status, total_price').eq('user_id', userId).order('created_at', { ascending: false });
            
            return {
                views,
                orders: orders || []
            };
        } catch (e) {
            console.error('[DB] getUserAnalytics Error:', e.message);
            return { views: [], orders: [] };
        }
    },
    COL_USERS,
    supabase
};

module.exports = {
    database,
    ...database
};
