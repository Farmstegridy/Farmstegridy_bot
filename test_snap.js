const { supabase } = require('./config/supabase');
async function run() {
    const { data: ordersSnap, error } = await supabase.from('bot_orders')
        .select('id, created_at, updated_at, total_price, status, product_name, priority_fee, is_priority, city, postal_code, district, address, livreur_name, user_id, platform, first_name, username, quantity')
        .order('created_at', { ascending: false })
        .limit(2);
    console.log(ordersSnap, error);
}
run();
