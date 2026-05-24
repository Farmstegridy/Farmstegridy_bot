const { supabase } = require('./config/supabase');
async function run() {
    const { data } = await supabase.from('bot_settings').select('*').eq('key', 'app_settings').single();
    if (data && data.data) {
        console.log('channel_url:', data.data.channel_url);
        
        // Let's set it if it's empty or wrong
        if (!data.data.channel_url || data.data.channel_url !== 'https://t.me/+mKavVHjVnuk3NDU0') {
            data.data.channel_url = 'https://t.me/+mKavVHjVnuk3NDU0';
            await supabase.from('bot_settings').update({ data: data.data }).eq('key', 'app_settings');
            console.log('Updated channel_url to https://t.me/+mKavVHjVnuk3NDU0');
        }
    }
}
run();
