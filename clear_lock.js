require('dotenv').config();
const { supabase } = require('./services/database');

async function main() {
    const { data, error } = await supabase.from('bot_settings').update({ value: null }).eq('key', 'telegram_lock');
    console.log("Cleared telegram lock. Error:", error);
}
main();
