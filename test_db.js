require('dotenv').config();
const { supabase } = require('./services/database');

async function test() {
    const { data, error } = await supabase.from('bot_settings').select('*').limit(1);
    console.log(data, error);
}
test();
