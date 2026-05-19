const { supabase } = require('../config/supabase');
async function run() {
    console.log("Updating bot_settings table in Supabase...");
    
    // Update both 'default' and 'config' rows
    const { data: defaultRow, error: defaultError } = await supabase.from('bot_settings').update({
        bot_name: 'Farmstegridy_bot',
        dashboard_title: 'Farmstegridy Bot Admin',
        admin_telegram_id: '8945099501',
        private_contact_url: 'https://t.me/Farmstegridy_bot'
    }).eq('id', 'default').select();

    if (defaultError) {
        console.error("Error updating default settings:", defaultError.message);
    } else {
        console.log("Successfully updated 'default' settings:", defaultRow);
    }

    const { data: configRow, error: configError } = await supabase.from('bot_settings').update({
        bot_name: 'Farmstegridy_bot',
        dashboard_title: 'Farmstegridy Bot Admin',
        admin_telegram_id: '8945099501',
        private_contact_url: 'https://t.me/Farmstegridy_bot'
    }).eq('id', 'config').select();

    if (configError) {
        console.error("Error updating config settings:", configError.message);
    } else {
        console.log("Successfully updated 'config' settings:", configRow);
    }
}
run();
