require('dotenv').config();
const { supabase } = require('./services/database');

async function main() {
    const { data, error } = await supabase.from('bot_stats').update({ tg_lock_owner: null, tg_lock_expires: null }).eq('id', 1);
    console.log("Cleared telegram lock. Error:", error);
}
main();
