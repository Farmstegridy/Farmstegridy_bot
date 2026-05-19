const { supabase } = require('./config/supabase');
async function run() {
    console.log("Updating bot_settings to new token: 8549299880:AAHO1Nj-xLj3SELZ4h9Uze1_NDDwaB2oVA4");
    const { error } = await supabase.from('bot_settings').update({
        telegram_token: '8549299880:AAHO1Nj-xLj3SELZ4h9Uze1_NDDwaB2oVA4',
        bot_name: 'Farmstegridy_bot',
        auto_approve_new: false,
        private_mode: false,
        force_subscribe: false
    }).eq('id', 'default');
    if (error) console.error("Error updating:", error.message);
    else console.log("Successfully updated telegram_token and bot_name in DB.");
}
run();
