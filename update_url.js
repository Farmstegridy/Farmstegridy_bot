const { supabase } = require('./config/supabase');
async function run() {
    const { data } = await supabase.from('bot_settings').select('*').eq('key', 'app_settings').single();
    if (data && data.data) {
        data.data.channel_url = 'https://t.me/+mKavVHjVnuk3NDU0';
        await supabase.from('bot_settings').update({ data: data.data }).eq('key', 'app_settings');
        console.log('Successfully updated channel_url to https://t.me/+mKavVHjVnuk3NDU0');
    } else {
        console.log('Could not find app_settings');
    }
}
run();
