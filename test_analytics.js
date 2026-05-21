const { supabase } = require('./config/supabase');
const { getOrderAnalytics } = require('./services/database');

async function run() {
    const data = await getOrderAnalytics();
    console.log("Total CA:", data.totalCA);
    console.log("Total Orders:", data.totalOrders);
}
run();
