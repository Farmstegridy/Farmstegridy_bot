const { supabase } = require('../config/supabase');
async function run() {
    const { data, error } = await supabase.from('bot_settings').select('*');
    if (error) {
        console.error("Error:", error);
    } else {
        const keys = Object.keys(data[0]);
        console.log("Keys containing 'token', 'key', 'id', 'tg', 'bot', 'admin':", 
            keys.filter(k => k.includes('token') || k.includes('key') || k.includes('id') || k.includes('tg') || k.includes('bot') || k.includes('admin'))
        );
        // Let's print the actual values for these keys in both rows
        data.forEach(row => {
            console.log("--- Row ID:", row.id);
            keys.forEach(k => {
                if (k.includes('token') || k.includes('key') || k.includes('admin') || k.includes('bot_name')) {
                    console.log(`  ${k}:`, row[k]);
                }
            });
        });
    }
}
run();
