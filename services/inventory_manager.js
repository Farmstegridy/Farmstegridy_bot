const { supabase } = require('../config/supabase');
const { createPersistentMap } = require('./persistent_map');

const userCarts = createPersistentMap('userCarts');

// Load userCarts initially
let userCartsLoaded = false;
userCarts.load().then(() => {
    userCartsLoaded = true;
}).catch(err => {
    console.error("[Inventory] Failed to load userCarts persistent map:", err.message);
});

const RESERVATION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Log a stock change in the audit ledger and update the product's physical stock.
 */
async function logStockMovement(productId, qtyChange, reason, referenceId = null) {
    try {
        console.log(`[Inventory] Logging movement: Product ${productId}, change ${qtyChange}, reason: ${reason}`);
        
        // 1. Insert into bot_stock_ledger
        const { error: ledgerErr } = await supabase
            .from('bot_stock_ledger')
            .insert([{
                product_id: String(productId),
                qty_change: parseInt(qtyChange) || 0,
                reason,
                reference_id: referenceId ? String(referenceId) : null
            }]);
            
        if (ledgerErr) {
            console.error(`[Inventory] Error inserting to stock ledger:`, ledgerErr.message);
        }
    } catch (e) {
        console.error(`[Inventory] Exception in logStockMovement:`, e.message);
    }
}

/**
 * Clean up expired items from all active shopping carts and log replenishment.
 */
async function cleanupExpiredReservations() {
    if (!userCartsLoaded) return;
    const now = Date.now();
    
    for (const [userId, cart] of userCarts.entries()) {
        if (!Array.isArray(cart) || cart.length === 0) continue;
        
        const validItems = [];
        const expiredItems = [];
        
        cart.forEach(item => {
            if (item.addedAt && (now - item.addedAt > RESERVATION_TIMEOUT_MS)) {
                expiredItems.push(item);
            } else {
                validItems.push(item);
            }
        });
        
        if (expiredItems.length > 0) {
            console.log(`[Inventory] Expired ${expiredItems.length} reserved item(s) for user ${userId}`);
            
            // Log expiration for each item
            for (const item of expiredItems) {
                await logStockMovement(item.productId, item.qty, 'reservation_expiry', userId);
            }
            
            // Save updated cart (or delete if empty)
            if (validItems.length === 0) {
                userCarts.delete(userId);
            } else {
                userCarts.set(userId, validItems);
            }
        }
    }
}

/**
 * Calculate the total reserved quantity of a product in all active shopping carts.
 */
async function getReservedStock(productId) {
    await cleanupExpiredReservations();
    
    let reserved = 0;
    userCarts.forEach(cart => {
        if (!Array.isArray(cart)) return;
        cart.forEach(item => {
            if (String(item.productId) === String(productId)) {
                reserved += parseFloat(item.qty) || 0;
            }
        });
    });
    
    return reserved;
}

/**
 * Get available stock (physical stock minus reserved stock).
 */
async function getAvailableStock(product) {
    if (!product) return 0;
    const physical = parseInt(product.stock) || 0;
    const reserved = await getReservedStock(product.id);
    return Math.max(0, physical - reserved);
}

/**
 * Return scarcity label and emoji badge.
 */
async function getScarcityBadge(product) {
    const available = await getAvailableStock(product);
    if (available <= 0) {
        return "🔴 Rupture de stock";
    }
    if (available <= 3) {
        return `🔥 Dépêchez-vous, plus que ${available} restants !`;
    }
    if (available <= 8) {
        return `🟡 Stock Limité (${available} dispo)`;
    }
    return `🟢 En Stock (${available})`;
}

/**
 * Get visual warning message for checkout.
 */
function getReservationWarningText(cartItem) {
    if (!cartItem || !cartItem.addedAt) return "";
    const elapsed = Date.now() - cartItem.addedAt;
    const remaining = Math.max(0, RESERVATION_TIMEOUT_MS - elapsed);
    if (remaining <= 0) return "";
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `⏳ Stock réservé encore ${minutes}:${seconds.toString().padStart(2, '0')} min`;
}

module.exports = {
    logStockMovement,
    cleanupExpiredReservations,
    getReservedStock,
    getAvailableStock,
    getScarcityBadge,
    getReservationWarningText,
    RESERVATION_TIMEOUT_MS
};
