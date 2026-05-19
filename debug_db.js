const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

async function debug() {
    console.log("Supabase URL:", supabaseUrl);
    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing credentials");
        return;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const tables = ['bot_users', 'bot_products', 'bot_orders', 'bot_stats', 'bot_settings'];
    
    for (const table of tables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            console.error(`Error on ${table}:`, error.message);
        } else {
            console.log(`Table ${table}: ${count} rows`);
        }
    }
    
    const { data: stats } = await supabase.from('bot_stats').select('*').eq('id', 1).maybeSingle();
    console.log("Stats row:", stats);
}

debug();
