require('dotenv').config();
const { supabase } = require('./services/database');
async function main() {
    await supabase.from('bot_stats').update({ tg_lock_owner: null, tg_lock_expires: null }).eq('id', 1);
}
main();
