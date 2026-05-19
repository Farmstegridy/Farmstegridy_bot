
const { supabase } = require('./config/supabase');
(async () => {
    try {
        const { data, error } = await supabase.from('bot_suppliers').select('*').eq('admin_telegram_id', '1183134641');
        console.log('--- SUPPLIER CHECK ---');
        console.log('Data:', data);
        if (error) console.error('Error:', error);
    } catch (e) {
        console.error(e);
    }
})();
