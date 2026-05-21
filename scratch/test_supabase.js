require('dotenv').config();
const { supabase } = require('../services/supabase');
const COL_USERS = 'users'; // Or whatever it is

async function run() {
    const { data, error } = await supabase.from('bot_users').select('*').eq('id', 'telegram_1183134641').maybeSingle();
    console.log("Data:", data ? "FOUND" : "NOT FOUND");
    console.log("Error:", error);
}
run();
