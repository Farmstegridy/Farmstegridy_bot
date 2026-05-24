const { supabase } = require('./config/supabase');
async function run() {
    const { data } = await supabase.from('bot_settings').select('*').eq('key', 'app_settings').single();
    if (data && data.data) {
        console.log('channel_url:', data.data.channel_url);
    }
}
run();
