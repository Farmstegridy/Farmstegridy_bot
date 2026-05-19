
const { supabase } = require('./config/supabase');
(async () => {
    try {
        const { data, count, error } = await supabase.from('bot_settings').select('*', { count: 'exact' });
        console.log('--- DB CHECK ---');
        console.log('Count:', count);
        console.log('Data:', data);
        if (error) console.error('Error:', error);
    } catch (e) {
        console.error(e);
    }
})();
