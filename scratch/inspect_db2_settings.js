const { supabase } = require('../config/supabase');
async function run() {
    console.log("SUPABASE_URL from env:", process.env.SUPABASE_URL);
    const { data: botSettings, error: err1 } = await supabase.from('bot_settings').select('*');
    if (err1) console.error("Error reading bot_settings:", err1);
    else console.log("bot_settings rows:", JSON.stringify(botSettings, null, 2));

    const { data: settings, error: err2 } = await supabase.from('settings').select('*');
    if (err2) console.error("Error reading settings:", err2);
    else console.log("settings rows:", JSON.stringify(settings, null, 2));
}
run();
