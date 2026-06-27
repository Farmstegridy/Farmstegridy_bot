const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/dikenson/Desktop/Farmstegridy_bot/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
async function check() {
    const { data } = await supabase.from('bot_settings').select('*').eq('id', 'default').single();
    console.log("msg_livreur_welcome:", data?.msg_livreur_welcome);
}
check();
