const { supabase } = require('./config/supabase');
async function check() {
    console.log("Checking bot_settings table...");
    const { data: s1, error: e1 } = await supabase.from('bot_settings').select('*').single();
    if (e1) console.error("Error bot_settings:", e1.message);
    else console.log("bot_settings.telegram_token:", s1.telegram_token ? "FOUND (len=" + s1.telegram_token.length + ")" : "NOT FOUND");

    console.log("Checking settings table...");
    const { data: s2, error: e2 } = await supabase.from('settings').select('*').single();
    if (e2) console.error("Error settings:", e2.message);
    else console.log("settings.telegram_token:", s2.telegram_token ? "FOUND (len=" + s2.telegram_token.length + ")" : "NOT FOUND");

    if (s1?.telegram_token || s2?.telegram_token) {
        console.log("Full Token from DB:", s1?.telegram_token || s2?.telegram_token);
    }
}
check();
