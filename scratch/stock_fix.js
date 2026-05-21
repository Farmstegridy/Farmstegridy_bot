const { supabase } = require('./config/supabase');
const { logStockMovement } = require('./services/inventory_manager');

async function adjustOrderStock(orderId, action) {
    const { data: order } = await supabase.from('bot_orders').select('*').eq('id', orderId).maybeSingle();
    if (!order || !order.notes) return;
    try {
        const cart = JSON.parse(order.notes);
        if (!Array.isArray(cart)) return;
        
        for (const item of cart) {
            const productId = item.productId;
            const qty = action === 'increment' ? item.qty : -item.qty;
            
            // fetch current stock
            const { data: p } = await supabase.from('bot_products').select('id, stock, name').eq('id', productId).maybeSingle();
            if (p && typeof p.stock === 'number') {
                const newStock = Math.max(0, p.stock + qty);
                await supabase.from('bot_products').update({ stock: newStock }).eq('id', productId);
                await logStockMovement(productId, qty, `order_${action}`, orderId);
            }
        }
    } catch(e) {
        console.error('adjustOrderStock error:', e);
    }
}
