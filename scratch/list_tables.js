const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/dikenson/Desktop/Farmstegridy_bot/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
async function check() {
    const { data, error } = await supabase.from('bot_products').select('*').limit(1);
    console.log(Object.keys(data[0] || {}));
}
check();
