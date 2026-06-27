const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/dikenson/Desktop/Farmstegridy_bot/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
async function check() {
    const { data } = await supabase.from('bot_products').select('id, name, category, is_active');
    console.log(data);
}
check();
