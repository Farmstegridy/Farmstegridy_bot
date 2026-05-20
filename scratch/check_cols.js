const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    const { data, error } = await supabase.from('bot_settings').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
        return;
    }
    const cols = Object.keys(data[0] || {});
    console.log('Includes mini_app_url?', cols.includes('mini_app_url'));
    console.log('Columns containing app or url:', cols.filter(c => c.toLowerCase().includes('app') || c.toLowerCase().includes('url')));
}

run();
